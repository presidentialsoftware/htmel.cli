
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, "htmldesktop.json");

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        stdio: "inherit",
        ...options,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${command} failed with exit code ${result.status}`);
    }

    return result;
}

if (!existsSync(configPath)) {
    throw new Error(`Configuration not found: ${configPath}`);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));

if (!config.name || !config.title || !config.entry) {
    throw new Error(
        "htmldesktop.json must define name, title, and entry."
    );
}

if (!/^[a-zA-Z0-9_-]+$/.test(config.name)) {
    throw new Error("Invalid application name.");
}

// Debian package names must be lowercase.
const packageName = config.name.toLowerCase().replace(/_/g, "-");

if (!/^[a-z0-9][a-z0-9+.-]*$/.test(packageName)) {
    throw new Error(`Invalid Debian package name: ${packageName}`);
}

const version = String(config.version || "0.1.0");

if (!/^[0-9][A-Za-z0-9.+:~_-]*$/.test(version)) {
    throw new Error(`Invalid Debian package version: ${version}`);
}

const outputDir = path.join(root, "dist", "debian");
const buildDir = path.join(outputDir, "root");
const packageDir = path.join(buildDir, "DEBIAN");

const linuxAppDir = path.join(
    root,
    "dist",
    "linux",
    config.name
);

const appInstallDir = path.join(
    buildDir,
    "opt",
    config.name
);

const desktopDir = path.join(
    buildDir,
    "usr",
    "share",
    "applications"
);

const desktopFileName = `${packageName}.desktop`;
const desktopPath = path.join(desktopDir, desktopFileName);

const debPath = path.join(
    outputDir,
    `${packageName}_${version}_${getArchitecture()}.deb`
);

function getArchitecture() {
    const result = spawnSync("dpkg", ["--print-architecture"], {
        encoding: "utf8",
    });

    if (result.error || result.status !== 0) {
        throw new Error(
            "Could not determine Debian architecture. Is dpkg installed?"
        );
    }

    return result.stdout.trim();
}

// Build the application using the existing Linux packaging workflow.
console.log("Building htmldesktop application...");
run(process.execPath, [path.join(root, "package-linux.js")]);

if (!existsSync(linuxAppDir)) {
    throw new Error(`Linux application output not found: ${linuxAppDir}`);
}

for (const file of [
    path.join(linuxAppDir, config.name),
    path.join(linuxAppDir, "launch.sh"),
    path.join(linuxAppDir, path.basename(config.entry)),
    path.join(linuxAppDir, "runtime", "background.js"),
]) {
    if (!existsSync(file)) {
        throw new Error(`Required application file missing: ${file}`);
    }
}

// Prepare a clean Debian filesystem tree.
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(packageDir, { recursive: true });
mkdirSync(appInstallDir, { recursive: true });
mkdirSync(desktopDir, { recursive: true });

// Install application files under /opt/<application-name>.
cpSync(linuxAppDir, appInstallDir, {
    recursive: true,
    force: true,
});

// Debian control metadata.
const control = [
    `Package: ${packageName}`,
    `Version: ${version}`,
    `Section: utils`,
    `Priority: optional`,
    `Architecture: ${getArchitecture()}`,
    `Maintainer: htmldesktop Project <htmldesktop@localhost>`,
    `Description: ${config.title}`,
    ` ${config.title} desktop application powered by GTK and WebKitGTK.`,
    `Depends: libc6, libgtk-3-0, libwebkit2gtk-4.1-0, nodejs`,
    "",
].join("\n");

writeFileSync(path.join(packageDir, "control"), control);

// Generate a desktop entry using the final installation paths.
const installedIcon = path.join(
    appInstallDir,
    "assets",
    "icon.png"
);

const desktopEntry = [
    "[Desktop Entry]",
    "Version=1.0",
    "Type=Application",
    `Name=${config.title.replace(/[\r\n]/g, " ")}`,
    `Comment=${String(config.description || config.title).replace(/[\r\n]/g, " ")}`,
    `Exec=${path.join(appInstallDir, "launch.sh")}`,
    ...(existsSync(installedIcon) ? [`Icon=${installedIcon}`] : []),
    `StartupWMClass=${config.name}`,
    "Terminal=false",
    "Categories=Development;",
    "",
].join("\n");

writeFileSync(desktopPath, desktopEntry);

// Set sensible permissions for the packaged files.
run("chmod", ["755", path.join(appInstallDir, config.name)]);
run("chmod", ["755", path.join(appInstallDir, "launch.sh")]);
run("chmod", ["644", path.join(packageDir, "control")]);
run("chmod", ["644", desktopPath]);

// Build the .deb without requiring root privileges to create the package.
mkdirSync(outputDir, { recursive: true });

console.log("Creating Debian package...");
run("dpkg-deb", [
    "--build",
    "--root-owner-group",
    buildDir,
    debPath,
]);

console.log("");
console.log("Debian package created successfully.");
console.log(`Package: ${debPath}`);
console.log(`Application: ${config.title}`);
console.log(`Install location: /opt/${config.name}`);
console.log(`Desktop entry: /usr/share/applications/${desktopFileName}`);
