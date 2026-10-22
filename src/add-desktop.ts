
#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectDir = process.cwd();
const desktopDir = path.join(
    projectDir,
    "node_modules",
    "htmldesktop"
);
const packagePath = path.join(projectDir, "package.json");
const force = process.argv.includes("--force");

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

// Ensure this command is being run from an HTMEL project.
if (!fs.existsSync(packagePath)) {
    fail(
        "No package.json found. Run this command from your HTMEL project root."
    );
}

// Read the existing project package.json.
let projectPackage;

try {
    projectPackage = JSON.parse(
        fs.readFileSync(packagePath, "utf8")
    );
} catch (error) {
    fail(`Could not parse package.json: ${error.message}`);
}

// Ensure the desktop dependency has been installed.
if (
    !fs.existsSync(desktopDir) ||
    !fs.statSync(desktopDir).isDirectory()
) {
    fail(
        'The "htmldesktop" dependency is not installed. ' +
        "Add it to your project's package.json and run npm install."
    );
}

console.log(`HTMEL project: ${projectDir}`);
console.log(`Desktop source: ${desktopDir}`);
console.log("Installing desktop support...\n");

// Root-level files from the htmldesktop repository.
const rootFiles = [
    "compile.sh",
    "launch.bash",
    "htmldesktop",
    "htmldesktop.json",
    "package-linux.js",
    "package-debian.js",
    "package-debian.readme.md"
];

// Directories from the htmldesktop repository.
const directories = [
    "native",
    "runtime",
    "template"
];

let copiedCount = 0;
let preservedCount = 0;
let skippedCount = 0;

function copyFile(relativePath) {
    const source = path.join(desktopDir, relativePath);
    const destination = path.join(projectDir, relativePath);

    if (
        !fs.existsSync(source) ||
        !fs.statSync(source).isFile()
    ) {
        console.warn(`Skipped missing file: ${relativePath}`);
        skippedCount++;
        return;
    }

    if (fs.existsSync(destination) && !force) {
        console.log(`Preserved existing file: ${relativePath}`);
        preservedCount++;
        return;
    }

    fs.mkdirSync(path.dirname(destination), {
        recursive: true
    });

    fs.copyFileSync(source, destination);

    // Preserve executable permissions where applicable.
    const mode = fs.statSync(source).mode & 0o777;
    fs.chmodSync(destination, mode);

    console.log(`Copied: ${relativePath}`);
    copiedCount++;
}

function copyDirectory(relativePath) {
    const source = path.join(desktopDir, relativePath);

    if (
        !fs.existsSync(source) ||
        !fs.statSync(source).isDirectory()
    ) {
        console.warn(`Skipped missing directory: ${relativePath}`);
        skippedCount++;
        return;
    }

    function walk(sourceDirectory, destinationDirectory) {
        for (const entry of fs.readdirSync(sourceDirectory, {
            withFileTypes: true
        })) {
            const sourcePath = path.join(
                sourceDirectory,
                entry.name
            );

            const destinationPath = path.join(
                destinationDirectory,
                entry.name
            );

            if (entry.isDirectory()) {
                walk(sourcePath, destinationPath);
            } else if (entry.isFile()) {
                const destinationRelativePath = path.relative(
                    projectDir,
                    destinationPath
                );

                copyFile(destinationRelativePath);
            }
        }
    }

    walk(
        source,
        path.join(projectDir, relativePath)
    );
}

// Copy the desktop runtime and packaging files.
for (const filename of rootFiles) {
    copyFile(filename);
}

for (const directory of directories) {
    copyDirectory(directory);
}

// Add desktop commands to the existing package.json.
// Preserve all existing package metadata and scripts.
projectPackage.scripts ||= {};

const desktopScripts = {
    "add:desktop": "node src/add-desktop.js",
    "desktop:build": "bash compile.sh",
    "desktop:package": "node package-linux.js",
    "desktop:package:debian": "node package-debian.js"
};

let scriptsChanged = false;

for (const [name, command] of Object.entries(desktopScripts)) {
    if (!projectPackage.scripts[name]) {
        projectPackage.scripts[name] = command;
        scriptsChanged = true;
        console.log(`Added npm script: ${name}`);
    } else {
        console.log(`Preserved existing npm script: ${name}`);
    }
}

if (scriptsChanged) {
    fs.writeFileSync(
        packagePath,
        JSON.stringify(projectPackage, null, 2) + "\n"
    );

    console.log("Updated existing package.json.");
} else {
    console.log("No package.json changes were needed.");
}

console.log("\nDesktop setup finished.");
console.log(`Files copied: ${copiedCount}`);
console.log(`Existing files preserved: ${preservedCount}`);
console.log(`Missing files or directories skipped: ${skippedCount}`);

console.log("\nNext steps:");
console.log("  npm run desktop:build");
console.log("  npm run desktop:package");
