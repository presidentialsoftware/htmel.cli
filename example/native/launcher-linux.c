#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <JavaScriptCore/JavaScript.h>
#include <stdlib.h>
#include <unistd.h>
#include <limits.h>
#include <string.h>

static GtkWidget *window;
static WebKitWebView *webview;
static GSubprocess *runtime_process;
static GDataInputStream *runtime_stdout;
static GOutputStream *runtime_stdin;
static gchar *window_settings_path = NULL;

static gint last_window_width = 900;
static gint last_window_height = 600;
static guint geometry_save_timeout_id = 0;

/* ---------- Window settings ---------- */

static gchar *get_window_settings_path(void)
{
    gchar *config_dir = g_build_filename(
        g_get_user_config_dir(), "htmldesktop", NULL
    );

    if (g_mkdir_with_parents(config_dir, 0700) != 0) {
        g_warning("Could not create htmldesktop settings directory.");
        g_free(config_dir);
        return NULL;
    }

    gchar *path = g_build_filename(config_dir, "window.ini", NULL);
    g_free(config_dir);

    return path;
}

static gboolean is_wayland_session(void)
{
    const gchar *backend = g_getenv("GDK_BACKEND");

    if (backend != NULL)
        return g_strrstr(backend, "wayland") != NULL;

    return g_getenv("WAYLAND_DISPLAY") != NULL;
}

static gboolean load_window_geometry(GtkWindow *win)
{
    if (window_settings_path == NULL)
        return FALSE;

    GKeyFile *key_file = g_key_file_new();
    GError *error = NULL;

    if (!g_key_file_load_from_file(
            key_file,
            window_settings_path,
            G_KEY_FILE_NONE,
            &error)) {
        g_clear_error(&error);
        g_key_file_unref(key_file);

        g_print(
            "htmldesktop: No saved window settings; using defaults.\n"
        );

        return FALSE;
    }

    gint width = g_key_file_get_integer(
        key_file, "Window", "width", NULL
    );

    gint height = g_key_file_get_integer(
        key_file, "Window", "height", NULL
    );

    gint x = g_key_file_get_integer(
        key_file, "Window", "x", NULL
    );

    gint y = g_key_file_get_integer(
        key_file, "Window", "y", NULL
    );

    g_key_file_unref(key_file);

    if (width < 200 || height < 150 ||
        width > 10000 || height > 10000) {
        g_print(
            "htmldesktop: Invalid saved dimensions; using defaults.\n"
        );

        return FALSE;
    }

    last_window_width = width;
    last_window_height = height;

    gtk_window_set_default_size(win, width, height);
    gtk_window_resize(win, width, height);

    if (is_wayland_session()) {
        g_print(
            "htmldesktop: Wayland detected; requested saved size "
            "%dx%d. Window placement is managed by the compositor.\n",
            width,
            height
        );
    } else {
        gtk_window_set_position(win, GTK_WIN_POS_NONE);
        gtk_window_move(win, x, y);

        g_print(
            "htmldesktop: Restoring geometry x=%d y=%d %dx%d\n",
            x, y, width, height
        );
    }

    return TRUE;
}

/*
 * Keep the latest allocated dimensions as the source of truth.
 * This signal works without relying on X11 configure events.
 */
static void on_window_size_allocate(
    GtkWidget *widget,
    GtkAllocation *allocation,
    gpointer user_data
);

static void save_window_geometry(GtkWindow *win);

static gboolean save_window_geometry_timeout(gpointer user_data)
{
    (void)user_data;

    geometry_save_timeout_id = 0;

    if (window != NULL)
        save_window_geometry(GTK_WINDOW(window));

    return G_SOURCE_REMOVE;
}

static void schedule_geometry_save(void)
{
    if (geometry_save_timeout_id != 0) {
        g_source_remove(geometry_save_timeout_id);
        geometry_save_timeout_id = 0;
    }

    /*
     * Wait until resizing settles before writing the settings file.
     * This avoids excessive disk writes during a drag-resize.
     */
    geometry_save_timeout_id = g_timeout_add(
        300,
        save_window_geometry_timeout,
        NULL
    );
}

static void on_window_size_allocate(
    GtkWidget *widget,
    GtkAllocation *allocation,
    gpointer user_data
)
{
    (void)user_data;

    if (allocation->width < 200 || allocation->height < 150)
        return;

    gboolean changed =
        allocation->width != last_window_width ||
        allocation->height != last_window_height;

    last_window_width = allocation->width;
    last_window_height = allocation->height;

    /*
     * Persist size changes after the window has settled.
     * The first valid allocation is also saved, so the settings
     * file can recover from an earlier default-size-only session.
     */
    if (changed && window_settings_path != NULL)
        schedule_geometry_save();

    (void)widget;
}

static void save_window_geometry(GtkWindow *win)
{
    if (window_settings_path == NULL) {
        g_warning("htmldesktop: Settings path is NULL.");
        return;
    }

    gint width = last_window_width;
    gint height = last_window_height;

    /*
     * Prefer the widget's actual allocation. On Wayland,
     * gtk_window_get_size() can disagree with the most recent
     * allocation during startup or while resizing.
     */
    GtkAllocation allocation;
    gtk_widget_get_allocation(GTK_WIDGET(win), &allocation);

    if (allocation.width >= 200 && allocation.height >= 150) {
        width = allocation.width;
        height = allocation.height;
    }

    if (width < 200 || height < 150) {
        g_warning(
            "htmldesktop: Refusing to save invalid window size %dx%d.",
            width,
            height
        );
        return;
    }

    last_window_width = width;
    last_window_height = height;

    GKeyFile *key_file = g_key_file_new();
    GError *error = NULL;

    /* Preserve existing coordinates and other settings. */
    g_key_file_load_from_file(
        key_file,
        window_settings_path,
        G_KEY_FILE_NONE,
        NULL
    );

    g_key_file_set_integer(key_file, "Window", "width", width);
    g_key_file_set_integer(key_file, "Window", "height", height);

    if (!is_wayland_session()) {
        gint x = 0;
        gint y = 0;

        gtk_window_get_position(win, &x, &y);

        g_key_file_set_integer(key_file, "Window", "x", x);
        g_key_file_set_integer(key_file, "Window", "y", y);
    }

    gsize length = 0;

    gchar *contents = g_key_file_to_data(
        key_file, &length, NULL
    );

    if (contents == NULL ||
        !g_file_set_contents(
            window_settings_path,
            contents,
            length,
            &error
        )) {
        g_warning(
            "htmldesktop: Failed to save settings: %s",
            error ? error->message : "Could not generate settings"
        );

        g_clear_error(&error);
    } else {
        g_print(
            "htmldesktop: Saved window size %dx%d to %s\n",
            width,
            height,
            window_settings_path
        );

        if (is_wayland_session()) {
            g_print(
                "htmldesktop: Exact window position is managed "
                "by the Wayland compositor.\n"
            );
        }
    }

    g_free(contents);
    g_key_file_unref(key_file);
}

/* ---------- Application directory ---------- */

static gchar *get_app_dir(void)
{
    char executable_path[PATH_MAX + 1];

    ssize_t length = readlink(
        "/proc/self/exe",
        executable_path,
        PATH_MAX
    );

    if (length < 0)
        return NULL;

    executable_path[length] = '\0';

    return g_path_get_dirname(executable_path);
}

/* ---------- Node.js runtime ---------- */

static void read_runtime_line(
    GObject *source,
    GAsyncResult *result,
    gpointer user_data
);

static void start_reading_runtime(void)
{
    if (runtime_stdout == NULL)
        return;

    g_data_input_stream_read_line_async(
        runtime_stdout,
        G_PRIORITY_DEFAULT,
        NULL,
        read_runtime_line,
        NULL
    );
}

static void read_runtime_line(
    GObject *source,
    GAsyncResult *result,
    gpointer user_data
)
{
    (void)user_data;

    GError *error = NULL;
    gsize length = 0;

    gchar *line = g_data_input_stream_read_line_finish(
        G_DATA_INPUT_STREAM(source),
        result,
        &length,
        &error
    );

    if (line == NULL) {
        if (error != NULL) {
            g_warning(
                "Runtime output error: %s",
                error->message
            );

            g_error_free(error);
        }

        return;
    }

    if (length > 0 && webview != NULL) {
        gchar *script = g_strdup_printf(
            "if (window.__htmldesktopReceive) "
            "window.__htmldesktopReceive(%s);",
            line
        );

        webkit_web_view_run_javascript(
            webview,
            script,
            NULL,
            NULL,
            NULL
        );

        g_free(script);
    }

    g_free(line);

    start_reading_runtime();
}

static gboolean start_runtime(const gchar *app_dir)
{
    gchar *runtime_script = g_build_filename(
        app_dir,
        "runtime",
        "background.js",
        NULL
    );

    if (!g_file_test(runtime_script, G_FILE_TEST_IS_REGULAR)) {
        g_warning(
            "Runtime script not found: %s",
            runtime_script
        );

        g_free(runtime_script);
        return FALSE;
    }

    GSubprocessLauncher *launcher = g_subprocess_launcher_new(
        G_SUBPROCESS_FLAGS_STDIN_PIPE |
        G_SUBPROCESS_FLAGS_STDOUT_PIPE
    );

    g_subprocess_launcher_set_cwd(launcher, app_dir);

    gchar *app_name = g_path_get_basename(app_dir);

    g_subprocess_launcher_setenv(
        launcher,
        "htmldesktop_APP_NAME",
        app_name,
        TRUE
    );

    const gchar *argv[] = {
        "node",
        runtime_script,
        NULL
    };

    GError *error = NULL;

    runtime_process = g_subprocess_launcher_spawnv(
        launcher,
        argv,
        &error
    );

    g_free(app_name);
    g_free(runtime_script);
    g_object_unref(launcher);

    if (runtime_process == NULL) {
        g_warning(
            "Could not start Node.js runtime: %s",
            error ? error->message : "unknown error"
        );

        g_clear_error(&error);
        return FALSE;
    }

    runtime_stdin = g_subprocess_get_stdin_pipe(runtime_process);

    runtime_stdout = g_data_input_stream_new(
        g_subprocess_get_stdout_pipe(runtime_process)
    );

    start_reading_runtime();

    return TRUE;
}

/* ---------- Native window resizing ---------- */

/*
 * Each resize handle stores its own GdkWindowEdge value.
 * Add one to the enum because GDK_WINDOW_EDGE_NORTH_WEST is zero.
 */
static gboolean on_resize_grip_button_press(
    GtkWidget *widget,
    GdkEventButton *event,
    gpointer user_data
)
{
    if (event->type != GDK_BUTTON_PRESS ||
        event->button != GDK_BUTTON_PRIMARY) {
        return FALSE;
    }

    gint edge_value = GPOINTER_TO_INT(
        g_object_get_data(
            G_OBJECT(widget),
            "htmldesktop-resize-edge"
        )
    );

    if (edge_value == 0)
        return FALSE;

    GdkWindowEdge edge = (GdkWindowEdge)(edge_value - 1);

    gtk_window_begin_resize_drag(
        GTK_WINDOW(user_data),
        edge,
        event->button,
        (gint)event->x_root,
        (gint)event->y_root,
        event->time
    );

    return TRUE;
}

/* ---------- Resize cursor ---------- */

static void on_resize_handle_realize(
    GtkWidget *widget,
    gpointer user_data
)
{
    (void)user_data;

    GdkWindow *gdk_window = gtk_widget_get_window(widget);

    if (gdk_window == NULL)
        return;

    GdkDisplay *display = gdk_window_get_display(gdk_window);

    const gchar *cursor_name = g_object_get_data(
        G_OBJECT(widget),
        "htmldesktop-resize-cursor"
    );

    if (cursor_name == NULL)
        cursor_name = "ew-resize";

    GdkCursor *cursor = gdk_cursor_new_from_name(
        display,
        cursor_name
    );

    if (cursor != NULL) {
        gdk_window_set_cursor(gdk_window, cursor);
        g_object_unref(cursor);
    } else {
        g_warning(
            "htmldesktop: Could not create cursor '%s'.",
            cursor_name
        );
    }
}

/*
 * Create an invisible native GTK resize handle.
 * Corner handles are added last so they take priority
 * where edge handles overlap.
 */
static GtkWidget *add_resize_handle(
    GtkWidget *overlay,
    GtkWindow *win,
    GdkWindowEdge edge,
    const gchar *cursor_name,
    GtkAlign horizontal_alignment,
    GtkAlign vertical_alignment,
    gint width,
    gint height
)
{
    GtkWidget *handle = gtk_event_box_new();

    gtk_event_box_set_visible_window(
        GTK_EVENT_BOX(handle),
        FALSE
    );

    gtk_widget_set_size_request(handle, width, height);
    gtk_widget_set_halign(handle, horizontal_alignment);
    gtk_widget_set_valign(handle, vertical_alignment);

    gtk_widget_set_hexpand(
        handle,
        horizontal_alignment == GTK_ALIGN_FILL
    );

    gtk_widget_set_vexpand(
        handle,
        vertical_alignment == GTK_ALIGN_FILL
    );

    g_object_set_data(
        G_OBJECT(handle),
        "htmldesktop-resize-edge",
        GINT_TO_POINTER((gint)edge + 1)
    );

    g_object_set_data_full(
        G_OBJECT(handle),
        "htmldesktop-resize-cursor",
        g_strdup(cursor_name),
        g_free
    );

    gtk_widget_add_events(
        handle,
        GDK_BUTTON_PRESS_MASK
    );

    g_signal_connect(
        handle,
        "realize",
        G_CALLBACK(on_resize_handle_realize),
        NULL
    );

    g_signal_connect(
        handle,
        "button-press-event",
        G_CALLBACK(on_resize_grip_button_press),
        win
    );

    gtk_overlay_add_overlay(
        GTK_OVERLAY(overlay),
        handle
    );

    gtk_overlay_set_overlay_pass_through(
        GTK_OVERLAY(overlay),
        handle,
        FALSE
    );

    return handle;
}

/* ---------- Frontend API bridge ---------- */

static void on_htmldesktop_message(
    WebKitUserContentManager *manager,
    WebKitJavascriptResult *value,
    gpointer user_data
)
{
    (void)manager;
    (void)user_data;

    if (runtime_stdin == NULL) {
        g_warning(
            "Frontend called the API, but the runtime is unavailable."
        );

        return;
    }

    JSCValue *js_value =
        webkit_javascript_result_get_js_value(value);

    gchar *message = jsc_value_to_string(js_value);

    if (message == NULL) {
        g_warning("Could not read frontend API request.");
        return;
    }

    g_print("Frontend -> htmldesktop runtime: %s\n", message);

    gchar *line = g_strconcat(message, "\n", NULL);

    GError *error = NULL;
    gsize bytes_written = 0;

    gboolean written = g_output_stream_write_all(
        runtime_stdin,
        line,
        strlen(line),
        &bytes_written,
        NULL,
        &error
    );

    if (!written) {
        g_warning(
            "Could not send request to runtime: %s",
            error ? error->message : "unknown error"
        );

        g_clear_error(&error);
    } else {
        g_print(
            "Sent %zu request bytes to runtime.\n",
            bytes_written
        );
    }

    g_free(line);
    g_free(message);
}

/* ---------- Custom window controls ---------- */

static void on_window_controls_message(
    WebKitUserContentManager *manager,
    WebKitJavascriptResult *value,
    gpointer user_data
)
{
    (void)manager;
    (void)user_data;

    JSCValue *js_value =
        webkit_javascript_result_get_js_value(value);

    gchar *action = jsc_value_to_string(js_value);

    if (action == NULL)
        return;

    if (g_strcmp0(action, "minimize") == 0) {
        gtk_window_iconify(GTK_WINDOW(window));
    } else if (g_strcmp0(action, "maximize") == 0) {
        if (gtk_window_is_maximized(GTK_WINDOW(window))) {
            gtk_window_unmaximize(GTK_WINDOW(window));
        } else {
            gtk_window_maximize(GTK_WINDOW(window));
        }
    } else if (g_strcmp0(action, "close") == 0) {
        gtk_widget_destroy(window);
    }

    g_free(action);
}

/* ---------- Window cleanup ---------- */

static void on_window_destroy(
    GtkWidget *widget,
    gpointer user_data
)
{
    (void)user_data;

    g_print("htmldesktop: Window closing; saving geometry...\n");

    /*
     * Cancel a pending debounced save so it cannot run after
     * the window is destroyed. Save the final allocation now.
     */
    if (geometry_save_timeout_id != 0) {
        g_source_remove(geometry_save_timeout_id);
        geometry_save_timeout_id = 0;
    }

    save_window_geometry(GTK_WINDOW(widget));

    webview = NULL;

    if (runtime_process != NULL) {
        g_subprocess_force_exit(runtime_process);
        g_object_unref(runtime_process);
        runtime_process = NULL;
    }

    if (runtime_stdout != NULL) {
        g_object_unref(runtime_stdout);
        runtime_stdout = NULL;
    }

    runtime_stdin = NULL;

    g_clear_pointer(&window_settings_path, g_free);

    gtk_main_quit();
}

/* ---------- Native titlebar dragging ---------- */

static gboolean on_webview_button_press(
    GtkWidget *widget,
    GdkEventButton *event,
    gpointer user_data
)
{
    (void)user_data;

    if (event->type != GDK_BUTTON_PRESS ||
        event->button != GDK_BUTTON_PRIMARY) {
        return FALSE;
    }

    GtkAllocation allocation;

    gtk_widget_get_allocation(widget, &allocation);

    /* Match the custom HTML titlebar. */
    const gdouble titlebar_height = 80.0;
    const gint controls_width = 150;

    if (event->y >= titlebar_height ||
        event->x >= allocation.width - controls_width) {
        return FALSE;
    }

    gtk_window_begin_move_drag(
        GTK_WINDOW(window),
        event->button,
        (gint)event->x_root,
        (gint)event->y_root,
        event->time
    );

    return TRUE;
}

/* ---------- Main ---------- */

int main(int argc, char **argv)
{
    if (argc < 2) {
        g_printerr(
            "Usage: htmldesktop <path-to-index.html>\n"
        );

        return 1;
    }

    gtk_init(&argc, &argv);

    window = gtk_window_new(GTK_WINDOW_TOPLEVEL);

    gchar *app_dir = get_app_dir();

    if (app_dir != NULL) {
        gchar *app_name = g_path_get_basename(app_dir);

        gtk_window_set_wmclass(
            GTK_WINDOW(window),
            app_name,
            app_name
        );

        gchar *icon_path = g_build_filename(
            app_dir,
            "assets",
            "icon.png",
            NULL
        );

        if (g_file_test(icon_path, G_FILE_TEST_IS_REGULAR)) {
            GError *icon_error = NULL;

            if (!gtk_window_set_icon_from_file(
                    GTK_WINDOW(window),
                    icon_path,
                    &icon_error)) {
                g_warning(
                    "Could not load icon: %s",
                    icon_error
                        ? icon_error->message
                        : "unknown error"
                );

                g_clear_error(&icon_error);
            }
        }

        g_free(icon_path);
        g_free(app_name);
    }

    gtk_window_set_title(GTK_WINDOW(window), "htmldesktop");
    gtk_window_set_default_size(GTK_WINDOW(window), 900, 600);
    gtk_window_set_resizable(GTK_WINDOW(window), TRUE);

    /* The HTML frontend supplies the custom titlebar. */
    gtk_window_set_decorated(GTK_WINDOW(window), FALSE);

    /* Restore saved geometry or center on first launch. */
    window_settings_path = get_window_settings_path();

    if (!load_window_geometry(GTK_WINDOW(window))) {
        gtk_window_set_position(
            GTK_WINDOW(window),
            GTK_WIN_POS_CENTER
        );
    }

    g_signal_connect(
        window,
        "size-allocate",
        G_CALLBACK(on_window_size_allocate),
        NULL
    );

    g_signal_connect(
        window,
        "destroy",
        G_CALLBACK(on_window_destroy),
        NULL
    );

    WebKitUserContentManager *manager =
        webkit_user_content_manager_new();

    if (!webkit_user_content_manager_register_script_message_handler(
            manager, "htmldesktop")) {
        g_printerr(
            "Could not register htmldesktop message handler.\n"
        );

        g_object_unref(manager);
        g_free(app_dir);
        gtk_widget_destroy(window);

        return 1;
    }

    if (!webkit_user_content_manager_register_script_message_handler(
            manager, "windowControls")) {
        g_printerr(
            "Could not register windowControls message handler.\n"
        );

        webkit_user_content_manager_unregister_script_message_handler(
            manager,
            "htmldesktop"
        );

        g_object_unref(manager);
        g_free(app_dir);
        gtk_widget_destroy(window);

        return 1;
    }

    g_signal_connect(
        manager,
        "script-message-received::windowControls",
        G_CALLBACK(on_window_controls_message),
        NULL
    );

    g_signal_connect(
        manager,
        "script-message-received::htmldesktop",
        G_CALLBACK(on_htmldesktop_message),
        NULL
    );

    const gchar *bridge_script =
        "(function() {"
        "  const pending = new Map();"
        "  let nextId = 1;"
        "  function call(method, ...args) {"
        "    const id = String(nextId++);"
        "    return new Promise((resolve, reject) => {"
        "      pending.set(id, { resolve, reject });"
        "      window.webkit.messageHandlers.htmldesktop.postMessage("
        "        JSON.stringify({ id, method, args })"
        "      );"
        "    });"
        "  }"
        "  Object.defineProperty(window, '__htmldesktopReceive', {"
        "    value: function(message) {"
        "      if (!message || message.id == null) return;"
        "      const item = pending.get(String(message.id));"
        "      if (!item) return;"
        "      pending.delete(String(message.id));"
        "      if (message.error) {"
        "        item.reject(new Error(message.error.message));"
        "      } else {"
        "        item.resolve(message.result);"
        "      }"
        "    }"
        "  });"
        "  window.htmldesktop = {"
        "    app: {"
        "      getInfo: () => call('app.getInfo')"
        "    },"
        "    system: {"
        "      getPlatform: () => call('system.getPlatform'),"
        "      getHomeDirectory: () => call('system.getHomeDirectory')"
        "    },"
        "    path: {"
        "      join: (...args) => call('path.join', ...args),"
        "      basename: (value) => call('path.basename', value),"
        "      dirname: (value) => call('path.dirname', value)"
        "    },"
        "    fs: {"
        "      readTextFile: (file) => call('fs.readTextFile', file),"
        "      writeTextFile: (file, content) => "
        "        call('fs.writeTextFile', file, content),"
        "      exists: (file) => call('fs.exists', file)"
        "    }"
        "  };"
        "})();";

    WebKitUserScript *user_script = webkit_user_script_new(
        bridge_script,
        WEBKIT_USER_CONTENT_INJECT_TOP_FRAME,
        WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START,
        NULL,
        NULL
    );

    webkit_user_content_manager_add_script(manager, user_script);
    webkit_user_script_unref(user_script);

    webview = WEBKIT_WEB_VIEW(
        webkit_web_view_new_with_user_content_manager(manager)
    );

    g_object_unref(manager);

    /* Retain native titlebar dragging from the webview. */
    gtk_widget_add_events(
        GTK_WIDGET(webview),
        GDK_BUTTON_PRESS_MASK
    );

    g_signal_connect(
        webview,
        "button-press-event",
        G_CALLBACK(on_webview_button_press),
        NULL
    );

    /*
     * Place WebKit inside a native GTK overlay.
     * The invisible native resize handles sit above the HTML page.
     */
    GtkWidget *overlay = gtk_overlay_new();

    gtk_container_add(GTK_CONTAINER(window), overlay);
    gtk_container_add(GTK_CONTAINER(overlay), GTK_WIDGET(webview));

    const gint edge_size = 8;
    const gint corner_size = 18;

    /* Left and right edges. */
    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_WEST, "ew-resize",
        GTK_ALIGN_START, GTK_ALIGN_FILL,
        edge_size, -1
    );

    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_EAST, "ew-resize",
        GTK_ALIGN_END, GTK_ALIGN_FILL,
        edge_size, -1
    );

    /* Top and bottom edges. */
    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_NORTH, "ns-resize",
        GTK_ALIGN_FILL, GTK_ALIGN_START,
        -1, edge_size
    );

    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_SOUTH, "ns-resize",
        GTK_ALIGN_FILL, GTK_ALIGN_END,
        -1, edge_size
    );

    /* Top-left and bottom-right corners. */
    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_NORTH_WEST, "nwse-resize",
        GTK_ALIGN_START, GTK_ALIGN_START,
        corner_size, corner_size
    );

    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_SOUTH_EAST, "nwse-resize",
        GTK_ALIGN_END, GTK_ALIGN_END,
        corner_size, corner_size
    );

    /* Top-right and bottom-left corners. */
    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_NORTH_EAST, "nesw-resize",
        GTK_ALIGN_END, GTK_ALIGN_START,
        corner_size, corner_size
    );

    add_resize_handle(
        overlay, GTK_WINDOW(window),
        GDK_WINDOW_EDGE_SOUTH_WEST, "nesw-resize",
        GTK_ALIGN_START, GTK_ALIGN_END,
        corner_size, corner_size
    );

    if (app_dir != NULL) {
        if (!start_runtime(app_dir)) {
            g_warning(
                "htmldesktop background APIs will not be available."
            );
        }

        g_free(app_dir);
    }

    GError *uri_error = NULL;

    gchar *uri = g_filename_to_uri(
        argv[1],
        NULL,
        &uri_error
    );

    if (uri == NULL) {
        g_printerr(
            "Could not convert HTML path to URI: %s\n",
            uri_error
                ? uri_error->message
                : "Unknown error"
        );

        g_clear_error(&uri_error);
        gtk_widget_destroy(window);

        return 1;
    }

    gtk_widget_show_all(window);

    webkit_web_view_load_uri(webview, uri);
    g_free(uri);

    gtk_main();

    return 0;
}