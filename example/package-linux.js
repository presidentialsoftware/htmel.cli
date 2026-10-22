import {
    copyFileSync,
    chmodSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
    existsSync,
    cpSync,
} from "node:fs";

import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, "htmldesktop.json");

if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));

if (!config.name || !config.title || !config.entry) {
    throw new Error("htmldesktop.json must define name, title, and entry.");
}

if (!/^[a-zA-Z0-9_-]+$/.test(config.name)) {
    throw new Error(
        "App name may contain only letters, numbers, underscores, and hyphens."
    );
}

const executable = path.join(root, "htmldesktop");
const entry = path.resolve(root, config.entry);
const frontendDir = path.dirname(entry);
const runtimeDir = path.join(root, "runtime");
const runtimeScript = path.join(runtimeDir, "background.js");

const icon = config.icon
    ? path.resolve(root, config.icon)
    : path.join(root, "template", "icon.png");

const output = path.join(root, "dist", "linux", config.name);

for (const file of [executable, entry, runtimeScript]) {
    if (!existsSync(file)) {
        throw new Error(`Required build file not found: ${file}`);
    }
}

// Confirm Node.js is available to the native launcher.
const nodeCheck = spawnSync("node", ["--version"], {
    encoding: "utf8",
});

if (nodeCheck.error || nodeCheck.status !== 0) {
    throw new Error(
        "Node.js was not found in PATH. Install Node.js or configure " +
        "the native launcher to use its absolute path."
    );
}

const nodePath = spawnSync("which", ["node"], {
    encoding: "utf8",
}).stdout?.trim();

if (!nodePath) {
    throw new Error("Could not determine the absolute path to Node.js.");
}

console.log(`Node.js: ${nodePath} (${nodeCheck.stdout.trim()})`);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

// Copy the frontend files into the package root.
cpSync(frontendDir, output, {
    recursive: true,
    force: true,
});

// Copy the runtime into the package.
const packagedRuntimeDir = path.join(output, "runtime");

cpSync(runtimeDir, packagedRuntimeDir, {
    recursive: true,
    force: true,
});

// Copy the native executable.
const appExecutable = path.join(output, config.name);

copyFileSync(executable, appExecutable);
chmodSync(appExecutable, 0o755);

const appHtml = path.join(output, path.basename(entry));

// Include the icon when available.
const assetsDir = path.join(output, "assets");
let packagedIcon = null;

if (existsSync(icon)) {
    mkdirSync(assetsDir, { recursive: true });
    packagedIcon = path.join(assetsDir, "icon.png");
    copyFileSync(icon, packagedIcon);
}

// Add a wrapper that launches the app with a predictable working directory.
// This does not replace the native executable.
const wrapperPath = path.join(output, "launch.sh");

const wrapper = `#!/bin/sh
set -eu

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export PATH="${path.dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin:$PATH"
export HTMLDESKTOP_APP_NAME="${config.name}"
export HTMLDESKTOP_APP_VERSION="${config.version ?? "0.1.0"}"

cd "$APP_DIR"
exec "$APP_DIR/${config.name}" "$APP_DIR/${path.basename(entry)}" "$@"
`;

writeFileSync(wrapperPath, wrapper);
chmodSync(wrapperPath, 0o755);

// Validate the critical package files.
const requiredPackageFiles = [
    appExecutable,
    appHtml,
    path.join(packagedRuntimeDir, "background.js"),
    wrapperPath,
];

for (const file of requiredPackageFiles) {
    if (!existsSync(file)) {
        throw new Error(`Package validation failed; missing: ${file}`);
    }
}

// Generate the desktop entry.
function quoteExec(value) {
    return `"${value
        .replace(/%/g, "%%")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')}"`;
}

const desktopFile = path.join(output, `${config.name}.desktop`);

const desktopEntry = [
    "[Desktop Entry]",
    "Version=1.0",
    "Type=Application",
    `Name=${config.title}`,
    `Comment=htmldesktop application ${config.version ?? ""}`,
    `Exec=${quoteExec(wrapperPath)}`,
    ...(packagedIcon ? [`Icon=${packagedIcon}`] : []),
    `StartupWMClass=${config.name}`,
    "Terminal=false",
    "Categories=Development;",
    "",
].join("\n");

writeFileSync(desktopFile, desktopEntry);
chmodSync(desktopFile, 0o755);

// Install the application-menu entry.
const applicationsDir = path.join(
    os.homedir(),
    ".local",
    "share",
    "applications"
);

mkdirSync(applicationsDir, { recursive: true });

const installedDesktopFile = path.join(
    applicationsDir,
    `${config.name.toLowerCase()}.desktop`
);

copyFileSync(desktopFile, installedDesktopFile);
chmodSync(installedDesktopFile, 0o755);

const refresh = spawnSync(
    "update-desktop-database",
    [applicationsDir],
    { stdio: "ignore" }
);

if (refresh.error) {
    console.log("Desktop database refresh utility unavailable.");
}

console.log("");
console.log(`Built ${config.title} successfully.`);
console.log(`Package: ${output}`);
console.log(`Executable: ${appExecutable}`);
console.log(`Launcher wrapper: ${wrapperPath}`);
console.log(`HTML entry: ${appHtml}`);
console.log(`Runtime: ${path.join(packagedRuntimeDir, "background.js")}`);
console.log(`Node.js: ${nodePath}`);
console.log(`Desktop entry: ${desktopFile}`);
console.log(`Applications menu entry: ${installedDesktopFile}`);


