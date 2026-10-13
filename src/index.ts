#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
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

program.parse(process.argv);
