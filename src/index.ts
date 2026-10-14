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
  .description("Create a new component")
  .action(async (componentName: string) => { });

program
  .command("create page <page-name>")
  .description("Create a new page")
  .action(async (pageName: string) => { });

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

program.parse(process.argv);
