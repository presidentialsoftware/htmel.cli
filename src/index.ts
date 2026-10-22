#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn, spawnSync } from "child_process";
import {
  userlistcomponent,
  useritemcomponent,
  usercss,
  indexhtml,
  mainjs,
  maincss,
  compilesh,
  webpackConfig,
  tsConfig,
  serverJS,
  packageJsonContent,
} from "./default_files";

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function requireHTMELProject(): boolean {
  const projectPath = process.cwd();
  const packagePath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packagePath)) {
    console.error(
      "No package.json found. Run this command inside an HTMEL project."
    );
    return false;
  }

  return true;
}

const program = new Command();

program
  .version("0.0.1")
  .description("CLI for creating a new project with htmel.");

program
  .command("create <project-name>")
  .description(
    "Create a new project directory and install necessary npm packages"
  )
  .action(async (projectName: string) => {
    // Step 1: Create a new project directory
    const projectPath = path.join(process.cwd(), projectName);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath);
      console.log(`Created project directory: ${projectPath}`);
    } else {
      console.error(
        "Directory already exists. Please choose a different project name."
      );
      process.exit(1);
    }

    // Step 2: Create components and public directories
    const componentsPath = path.join(projectPath, "components");
    const publicPath = path.join(projectPath, "public");

    fs.mkdirSync(componentsPath);
    fs.mkdirSync(publicPath);

    // Step 3: Generate files in components folder
    fs.writeFileSync(
      path.join(componentsPath, "user-list.component.ts"),
      userlistcomponent
    );
    fs.writeFileSync(
      path.join(componentsPath, "user-item.component.tsx"),
      useritemcomponent
    );
    fs.writeFileSync(path.join(componentsPath, "userlist.css"), usercss);

    // Step 4: Generate files in public folder
    fs.writeFileSync(path.join(publicPath, "index.html"), indexhtml);
    fs.writeFileSync(path.join(publicPath, "main.js"), mainjs);
    fs.writeFileSync(path.join(publicPath, "style.css"), maincss);

    // Step 5: Create additional files in the root directory
    fs.writeFileSync(path.join(projectPath, "compile.sh"), compilesh);
    fs.writeFileSync(
      path.join(projectPath, "webpack.config.js"),
      webpackConfig
    );
    fs.writeFileSync(path.join(projectPath, "tsconfig.json"), tsConfig);
    fs.writeFileSync(path.join(projectPath, "server.ts"), serverJS);
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      packageJsonContent(projectName)
    );

    console.log("Created project structure and default files");

    // Step 6: Install npm packages using child_process.spawn
    const installProcess = spawn("npm", ["install"], {
      cwd: projectPath,
      stdio: "inherit",
    });

    installProcess.on("close", (code) => {
      if (code === 0) {
        console.log("Dependencies installed successfully.");
        // Step 7: Run `npm start` after installation is complete
        const startProcess = spawn("npm", ["start"], {
          cwd: projectPath,
          stdio: "inherit",
        });

        startProcess.on("close", (startCode) => {
          if (startCode === 0) {
            console.log("Project started successfully.");
          } else {
            console.error(`npm start failed with exit code ${startCode}`);
          }
        });
      } else {
        console.error(`npm install failed with exit code ${code}`);
      }
    });
  });


program
  .command("create component <component-name>")
  .description("Create a new TypeScript component")
  .option("--tsx", "Create a TSX component instead of TS")
  .action(
    async (
      componentName: string,
      options: { tsx?: boolean }
    ) => {
      createComponent(componentName, Boolean(options.tsx));

      function createComponent(
        componentName: string,
        useTSX: boolean
      ): void {
        if (!requireHTMELProject()) {
          process.exitCode = 1;
          return;
        }

        const name = toKebabCase(componentName);

        if (!name) {
          console.error("Please provide a valid component name.");
          process.exitCode = 1;
          return;
        }

        const extension = useTSX ? "tsx" : "ts";
        const componentsPath = path.join(process.cwd(), "components");
        const componentPath = path.join(
          componentsPath,
          `${name}.component.${extension}`
        );

        fs.mkdirSync(componentsPath, { recursive: true });

        if (fs.existsSync(componentPath)) {
          console.error(`Component already exists: ${componentPath}`);
          process.exitCode = 1;
          return;
        }

        const className = name
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("");

        const content = useTSX
          ? `import { Component, Props, Prop, State, JSX } from "htmel";

              export class ${className}Component extends Component {
                render(): JSX.Element {
                  return (
                    <div class="${name}">
                      ${className}
                    </div>
                  );
                }
              }
            `
          : `import { Component } from "htmel";

              export class ${className}Component extends Component {
                render() {
                  return {
                    tag: "div",
                    props: { class: "${name}" },
                    children: ["${className}"],
                  };
                }
              }
            `;

        fs.writeFileSync(componentPath, content, "utf8");

        console.log(`Created component: ${path.relative(process.cwd(), componentPath)}`);
      }

    }
  );

program
  .command("create page <page-name>")
  .description("Create a new page folder with index.html")
  .action(async (pageName: string) => {
    createPage(pageName);

    function createPage(pageName: string): void {
      if (!requireHTMELProject()) {
        process.exitCode = 1;
        return;
      }

      const name = toKebabCase(pageName);

      if (!name) {
        console.error("Please provide a valid page name.");
        process.exitCode = 1;
        return;
      }

      const pagePath = path.join(process.cwd(), name);
      const indexPath = path.join(pagePath, "index.html");

      if (fs.existsSync(pagePath)) {
        console.error(`Page directory already exists: ${pagePath}`);
        process.exitCode = 1;
        return;
      }

      fs.mkdirSync(pagePath, { recursive: true });

      const title = name
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      const html = `<!doctype html>
                    <html lang="en">
                    <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <title>${title}</title>
                    </head>
                    <body>
                      <main>
                        <h1>${title}</h1>
                      </main>
                    </body>
                    </html>
                    `;

      fs.writeFileSync(indexPath, html, "utf8");

      console.log(`Created page: ${path.relative(process.cwd(), indexPath)}`);
    }
  });

program
  .command("add:android")
  .description("Add android support")
  .action(async () => {
    createAndroid();

    function createAndroid(): void {
      const projectPath = process.cwd();
      const packagePath = path.join(projectPath, "package.json");

      // Only add Android to an existing HTMEL project.
      if (!fs.existsSync(packagePath)) {
        console.error(
          "No package.json found. Run this command inside an HTMEL project."
        );
        process.exitCode = 1;
        return;
      }

      const htmlPath = [
        path.join(projectPath, "index.html"),
        path.join(projectPath, "public", "index.html"),
      ].find((file) => fs.existsSync(file));

      if (!htmlPath) {
        console.error(
          "Could not find index.html in the project root or public/."
        );
        process.exitCode = 1;
        return;
      }

      const platformPath = path.join(
        projectPath,
        "platforms",
        "android"
      );

      if (fs.existsSync(platformPath)) {
        console.error("Android has already been added to this project.");
        process.exitCode = 1;
        return;
      }

      const tempPath = fs.mkdtempSync(
        path.join(os.tmpdir(), "htmelmobile-")
      );

      try {
        console.log("Downloading the HTMEL Android template...");

        const result = spawnSync(
          "git",
          [
            "clone",
            "--depth",
            "1",
            "https://github.com/presidentialsoftware/htmelmobile.git",
            tempPath,
          ],
          { stdio: "inherit" }
        );

        if (result.error) {
          throw result.error;
        }

        if (result.status !== 0) {
          throw new Error("Could not clone the htmelmobile repository.");
        }

        const templatePath = path.join(tempPath, "android");

        if (!fs.existsSync(templatePath)) {
          throw new Error(
            "The repository does not contain the expected android/ directory."
          );
        }

        fs.mkdirSync(path.dirname(platformPath), {
          recursive: true,
        });

        fs.cpSync(templatePath, platformPath, {
          recursive: true,
          errorOnExist: true,
        });

        console.log("Android template added successfully.");
        console.log(`Project: ${projectPath}`);
        console.log(`Android files: ${platformPath}`);
        console.log(`HTML source: ${htmlPath}`);
        console.log(
          "Next: configure the Android WebView to load the project's built web assets."
        );
      } catch (error) {
        // Remove a partially copied platform so the user can retry.
        fs.rmSync(platformPath, {
          recursive: true,
          force: true,
        });

        console.error(
          "Failed to create Android:",
          error instanceof Error ? error.message : error
        );

        process.exitCode = 1;
      } finally {
        fs.rmSync(tempPath, {
          recursive: true,
          force: true,
        });
      }
    }
  });

program
  .command("add:ios")
  .description("Add ios support")
  .action(async () => {
    createIOS();

    function createIOS(): void {
      const projectPath = process.cwd();
      const packagePath = path.join(projectPath, "package.json");

      // Require an existing HTMEL project.
      if (!fs.existsSync(packagePath)) {
        console.error(
          "No package.json found. Run this command inside an HTMEL project."
        );
        process.exitCode = 1;
        return;
      }

      // Accept either supported website location.
      const htmlPath = [
        path.join(projectPath, "index.html"),
        path.join(projectPath, "public", "index.html"),
      ].find((file) => fs.existsSync(file));

      if (!htmlPath) {
        console.error(
          "Could not find index.html in the project root or public/."
        );
        process.exitCode = 1;
        return;
      }

      const platformPath = path.join(
        projectPath,
        "platforms",
        "ios"
      );

      if (fs.existsSync(platformPath)) {
        console.error("iOS has already been added to this project.");
        process.exitCode = 1;
        return;
      }

      const tempPath = fs.mkdtempSync(
        path.join(os.tmpdir(), "htmelmobile-")
      );

      try {
        console.log("Downloading the HTMEL iOS template...");

        const result = spawnSync(
          "git",
          [
            "clone",
            "--depth",
            "1",
            "https://github.com/presidentialsoftware/htmelmobile.git",
            tempPath,
          ],
          { stdio: "inherit" }
        );

        if (result.error) {
          throw result.error;
        }

        if (result.status !== 0) {
          throw new Error(
            "Could not clone the htmelmobile repository."
          );
        }

        const templatePath = path.join(tempPath, "ios");

        if (!fs.existsSync(templatePath)) {
          throw new Error(
            "The repository does not contain the expected ios/ directory."
          );
        }

        fs.mkdirSync(path.dirname(platformPath), {
          recursive: true,
        });

        fs.cpSync(templatePath, platformPath, {
          recursive: true,
          errorOnExist: true,
        });

        console.log("iOS template added successfully.");
        console.log(`Project: ${projectPath}`);
        console.log(`iOS files: ${platformPath}`);
        console.log(`HTML source: ${htmlPath}`);
        console.log(
          "Next: configure the iOS WebView to load the project's built web assets."
        );

        console.log(
          "Building and running the iOS app requires macOS and Xcode."
        );
      } catch (error) {
        fs.rmSync(platformPath, {
          recursive: true,
          force: true,
        });

        console.error(
          "Failed to create iOS:",
          error instanceof Error ? error.message : error
        );

        process.exitCode = 1;
      } finally {
        fs.rmSync(tempPath, {
          recursive: true,
          force: true,
        });
      }
    }
  });

program
  .command("run:android")
  .description("Run android studio emulator")
  .action(async () => {
    runAndroid();

    function runAndroid(): void {
      const projectPath = process.cwd();
      const androidPath = path.join(
        projectPath,
        "platforms",
        "android"
      );

      if (!fs.existsSync(androidPath)) {
        console.error(
          "Android is not configured. Run htmel create android first."
        );
        process.exitCode = 1;
        return;
      }

      const gradle = process.platform === "win32"
        ? "gradlew.bat"
        : "./gradlew";

      const gradlePath = path.join(androidPath, gradle);

      if (!fs.existsSync(gradlePath)) {
        console.error(`Gradle wrapper not found: ${gradlePath}`);
        process.exitCode = 1;
        return;
      }

      // Determine the Android application ID.
      const gradleFiles = [
        path.join(androidPath, "app", "build.gradle"),
        path.join(androidPath, "app", "build.gradle.kts"),
      ];

      let applicationId: string | undefined;

      for (const file of gradleFiles) {
        if (!fs.existsSync(file)) continue;

        const content = fs.readFileSync(file, "utf8");
        const match = content.match(
          /applicationId\s*(?:=\s*)?["']([^"']+)["']/
        );

        if (match) {
          applicationId = match[1];
          break;
        }
      }

      if (!applicationId) {
        console.error(
          "Could not determine applicationId from the Android Gradle configuration."
        );
        process.exitCode = 1;
        return;
      }

      const run = (
        command: string,
        args: string[],
        cwd: string
      ): boolean => {
        const result = spawnSync(command, args, {
          cwd,
          stdio: "inherit",
          shell: process.platform === "win32",
        });

        if (result.error) {
          console.error(result.error.message);
          return false;
        }

        if (result.status !== 0) {
          console.error(`${command} failed with exit code ${result.status}`);
          return false;
        }

        return true;
      };

      console.log("Building Android app...");

      const gradleCommand = process.platform === "win32"
        ? gradlePath
        : "./gradlew";

      if (!run(gradleCommand, ["assembleDebug"], androidPath)) {
        process.exitCode = 1;
        return;
      }

      const apkPath = path.join(
        androidPath,
        "app",
        "build",
        "outputs",
        "apk",
        "debug",
        "app-debug.apk"
      );

      if (!fs.existsSync(apkPath)) {
        console.error(`APK not found: ${apkPath}`);
        process.exitCode = 1;
        return;
      }

      console.log("Installing Android app...");

      if (!run("adb", ["install", "-r", apkPath], projectPath)) {
        console.error(
          "Installation failed. Check that an emulator or Android device is connected."
        );
        process.exitCode = 1;
        return;
      }

      console.log("Launching Android app...");

      if (!run(
        "adb",
        ["shell", "monkey", "-p", applicationId, "1"],
        projectPath
      )) {
        process.exitCode = 1;
        return;
      }

      console.log("Android app launched.");
    }
  });

program
  .command("run:ios")
  .description("Run xcode ios emulator")
  .action(async () => {
    runIOS();

    function runIOS(): void {
      if (process.platform !== "darwin") {
        console.error(
          "iOS builds require macOS and Xcode."
        );
        process.exitCode = 1;
        return;
      }

      const projectPath = process.cwd();
      const iosPath = path.join(
        projectPath,
        "platforms",
        "ios"
      );

      const xcodeProject = path.join(
        iosPath,
        "htmelMobileApp",
        "htmelMobileApp.xcodeproj"
      );

      if (!fs.existsSync(xcodeProject)) {
        console.error(
          `Xcode project not found: ${xcodeProject}. Run htmel create ios first.`
        );
        process.exitCode = 1;
        return;
      }

      const run = (
        command: string,
        args: string[]
      ): boolean => {
        const result = spawnSync(command, args, {
          cwd: iosPath,
          stdio: "inherit",
        });

        if (result.error) {
          console.error(result.error.message);
          return false;
        }

        if (result.status !== 0) {
          console.error(`${command} failed with exit code ${result.status}`);
          return false;
        }

        return true;
      };

      console.log("Building iOS app...");

      const derivedData = path.join(
        iosPath,
        "build"
      );

      if (!run("xcodebuild", [
        "-project", xcodeProject,
        "-scheme", "htmelMobileApp",
        "-sdk", "iphonesimulator",
        "-configuration", "Debug",
        "-derivedDataPath", derivedData,
        "build",
      ])) {
        process.exitCode = 1;
        return;
      }

      const appPath = path.join(
        derivedData,
        "Build",
        "Products",
        "Debug-iphonesimulator",
        "htmelMobileApp.app"
      );

      if (!fs.existsSync(appPath)) {
        console.error(`Built iOS app not found: ${appPath}`);
        process.exitCode = 1;
        return;
      }

      console.log("Opening iOS Simulator...");

      if (!run("open", ["-a", "Simulator"])) {
        process.exitCode = 1;
        return;
      }

      // Install on a booted simulator.
      if (!run("xcrun", [
        "simctl", "install", "booted", appPath,
      ])) {
        console.error(
          "Could not install on a booted simulator. Open Simulator and boot a device first."
        );
        process.exitCode = 1;
        return;
      }

      console.log(
        "iOS app installed. Use Simulator to launch the app."
      );
    }
  });

program
  .command("build:website")
  .description("build website assets")
  .action(async () => {
    buildWebsite();

    function buildWebsite(): boolean {
      const projectPath = process.cwd();
      const packagePath = path.join(projectPath, "package.json");

      if (!fs.existsSync(packagePath)) {
        console.error(
          "No package.json found. Run this command inside an HTMEL project."
        );
        return false;
      }

      const packageJson = JSON.parse(
        fs.readFileSync(packagePath, "utf8")
      );

      if (!packageJson.scripts?.build) {
        console.error(
          'No "build" script found in package.json.'
        );
        console.error(
          'Add a build script, for example: "build": "webpack"'
        );
        return false;
      }

      console.log("Building HTMEL website...");

      const result = spawnSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["run", "build"],
        {
          cwd: projectPath,
          stdio: "inherit",
          shell: process.platform === "win32",
        }
      );

      if (result.error) {
        console.error(result.error.message);
        return false;
      }

      if (result.status !== 0) {
        console.error(
          `Website build failed with exit code ${result.status}`
        );
        return false;
      }

      console.log("Website build completed successfully.");
      return true;
    }
  });

program
  .command("build:android")
  .description("build android assets")
  .action(async () => {
    buildAndroid();

    function buildAndroid(): boolean {
      const androidPath = path.join(
        process.cwd(),
        "platforms",
        "android"
      );

      if (!fs.existsSync(androidPath)) {
        console.error(
          "Android is not configured. Run htmel create android first."
        );
        return false;
      }

      const gradleName = process.platform === "win32"
        ? "gradlew.bat"
        : "gradlew";

      const gradlePath = path.join(androidPath, gradleName);

      if (!fs.existsSync(gradlePath)) {
        console.error(`Gradle wrapper not found: ${gradlePath}`);
        return false;
      }

      console.log("Building Android app...");

      const result = spawnSync(
        process.platform === "win32" ? gradlePath : "./gradlew",
        ["assembleDebug"],
        {
          cwd: androidPath,
          stdio: "inherit",
          shell: process.platform === "win32",
        }
      );

      if (result.error) {
        console.error(result.error.message);
        return false;
      }

      if (result.status !== 0) {
        console.error(
          `Android build failed with exit code ${result.status}`
        );
        return false;
      }

      console.log(
        "Android build completed: platforms/android/app/build/outputs/apk/debug/app-debug.apk"
      );

      return true;
    }
  });

program
  .command("build:ios")
  .description("build ios assets")
  .action(async () => {
    buildIOS();

    function buildIOS(): boolean {
      if (process.platform !== "darwin") {
        console.error("iOS builds require macOS and Xcode.");
        return false;
      }

      const iosPath = path.join(
        process.cwd(),
        "platforms",
        "ios"
      );

      const xcodeProject = path.join(
        iosPath,
        "htmelMobileApp",
        "htmelMobileApp.xcodeproj"
      );

      if (!fs.existsSync(xcodeProject)) {
        console.error(
          "iOS is not configured. Run htmel create ios first."
        );
        return false;
      }

      console.log("Building iOS app for Simulator...");

      const result = spawnSync(
        "xcodebuild",
        [
          "-project", xcodeProject,
          "-scheme", "htmelMobileApp",
          "-sdk", "iphonesimulator",
          "-configuration", "Debug",
          "-derivedDataPath", path.join(iosPath, "build"),
          "build",
        ],
        {
          cwd: iosPath,
          stdio: "inherit",
        }
      );

      if (result.error) {
        console.error(result.error.message);
        return false;
      }

      if (result.status !== 0) {
        console.error(
          `iOS build failed with exit code ${result.status}`
        );
        return false;
      }

      console.log("iOS build completed successfully.");
      return true;
    }
  });



program
  .command("add:desktop")
  .description("Add TinyJS desktop support to the current HTMEL project")
  .option("--force", "Overwrite existing desktop files")
  .action((options: { force?: boolean }) => {
    const projectDir = process.cwd();
    const packagePath = path.join(projectDir, "package.json");
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "htmldesktop-")
    );
    const repoDir = path.join(tempDir, "repo");

    if (!fs.existsSync(packagePath)) {
      console.error(
        "Error: No package.json found. Run this command inside an HTMEL project."
      );
      fs.rmSync(tempDir, { recursive: true, force: true });
      process.exitCode = 1;
      return;
    }

    try {
      console.log("Downloading TinyJS desktop runtime...");

      const clone = spawnSync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--branch",
          "main",
          "https://github.com/presidentialsoftware/htmldesktop.git",
          repoDir
        ],
        { stdio: "inherit" }
      );

      if (clone.error) {
        throw clone.error;
      }

      if (clone.status !== 0) {
        throw new Error(
          "Could not download htmldesktop. Check your internet connection and Git installation."
        );
      }

      const rootFiles = [
        "compile-linux.sh",
        "launch-linux.bash",
        "htmldesktop.json",
        "package-linux.js",
        "package-debian.js",
        "package-debian.readme.md"
      ];

      const directories = ["native", "runtime", "template"];

      function copyItem(relativePath: string): void {
        const source = path.join(repoDir, relativePath);
        const destination = path.join(projectDir, relativePath);

        if (!fs.existsSync(source)) {
          console.warn(`Skipping missing repository item: ${relativePath}`);
          return;
        }

        if (fs.existsSync(destination) && !options.force) {
          console.log(`Keeping existing: ${relativePath}`);
          return;
        }

        fs.cpSync(source, destination, {
          recursive: true,
          force: true
        });

        console.log(`Copied: ${relativePath}`);
      }

      for (const file of rootFiles) {
        copyItem(file);
      }

      for (const directory of directories) {
        copyItem(directory);
      }

      const packageJson = JSON.parse(
        fs.readFileSync(packagePath, "utf8")
      );

      packageJson.scripts ??= {};

      const desktopScripts: Record<string, string> = {
        "desktop:build-linux": "bash compile-linux.sh",
        "desktop:run-linux": "bash launch-linux.bash",
        "desktop:package-linux": "node package-linux.js",
        "desktop:package:debian": "node package-debian.js"
      };

      for (const [name, command] of Object.entries(desktopScripts)) {
        if (options.force || !packageJson.scripts[name]) {
          packageJson.scripts[name] = command;
        }
      }

      fs.writeFileSync(
        packagePath,
        JSON.stringify(packageJson, null, 2) + "\n"
      );

      console.log("\nTinyJS desktop support added.");
      console.log("Next steps:");
      console.log("  npm run desktop:build");
      console.log("  npm run desktop:package");
    } catch (error) {
      console.error(
        "Failed to add desktop support:",
        error instanceof Error ? error.message : error
      );
      process.exitCode = 1;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });


program.parse(process.argv);
