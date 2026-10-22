
# htmldesktop Debian Installer

This stage of htmldesktop adds Debian package (`.deb`) creation, allowing the Linux application to be installed and removed using standard Debian package tools.

## Requirements

Install the required packaging tools:

```bash
sudo apt update
sudo apt install dpkg-dev
```

Ensure Node.js and the existing htmldesktop Linux build dependencies are installed.

## Setup

Create `package-debian.js` in the project root.

Add the following script to the `scripts` section of `package.json`, preserving existing scripts:

```json
"package:deb": "node package-debian.js"
```

## Build the Debian Package

From the project directory, run:

```bash
npm run package:deb
```

The script prepares the Linux application, stages its files, creates Debian package metadata, and builds the `.deb` installer.

The resulting package should be located in:

```text
dist/debian/
```

The filename follows this general pattern:

```text
<package-name>_<version>_<architecture>.deb
```

## Install

Install the generated package:

```bash
sudo apt install ./dist/debian/<package-file>.deb
```

Replace `<package-file>` with the actual generated filename.

The application is designed to install under:

```text
/opt/<application-name>/
```

The desktop entry is installed under:

```text
/usr/share/applications/
```

After installation, the application should appear in the desktop environment's application menu.

## Launch

Launch htmldesktop from the desktop application menu or run:

```bash
/opt/<application-name>/launch.sh
```

Replace `<application-name>` with the configured application name.

## Uninstall

Remove the installed application using its Debian package name:

```bash
sudo apt remove <package-name>
```

## Troubleshooting

### Node.js errors

Verify Node.js is installed:

```bash
node --version
```

If the packaging script reports an ES module error, check whether `package.json` requires `"type": "module"` or whether the scripts should use the `.mjs` extension.

### WebKitGTK dependency errors

The Debian package must declare the WebKitGTK runtime dependency that matches the version used to compile htmldesktop. Package names such as `libwebkit2gtk-4.0-37` and `libwebkit2gtk-4.1-0` are not interchangeable.

### Build errors

Ensure the native executable and HTML entry file exist, and inspect the terminal output for missing dependencies or invalid paths.

## Current Limitations

- Node.js is a system dependency and is not bundled with the application.
- WebKitGTK and other runtime dependencies must be installed on the target system.
- Installing the `.deb` normally requires administrator privileges.
- Windows and macOS installers are not included in this stage.

## Development Workflow

1. Compile the native Linux application.
2. Prepare the Linux application build.
3. Generate the Debian package.
4. Install and test the package.
5. Resolve any dependency or launcher issues.
6. Rebuild and test before distributing.

## License

Add the project's license and copyright information before distributing htmldesktop.
