export const userlistcomponent = `// components/user-list.ts
import { Component } from "htmel";
import { UserItem } from "./user-item.component";

@Component({
  tag: "user-list",
  shadow: true,
  styleUrl: "./components/userlist.css"
})
export class UserList extends HTMLElement {
  users: any[];

  constructor() {
    super();
    // Initialize the user data
    this.users = [];

    // Fetch and render users
    this.fetchAndRenderUsers();
  }

  async fetchAndRenderUsers() {
    // Mock API endpoint (replace with your actual API endpoint)
    const apiUrl = "https://jsonplaceholder.typicode.com/users";

    try {
      const response = await fetch(apiUrl);
      const users = await response.json();
      this.users = users;
      this.renderUsers();
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }

  renderUsers() {
    const userFragment = document.createDocumentFragment();

    this.users.forEach((user) => {
      const item = new UserItem();
      item.user = user;
      const jsx = item.render();
      userFragment.appendChild(jsx);
    });

    this.shadowRoot.appendChild(userFragment);
  }
}

export default UserList;
`;

export const useritemcomponent = `// components/user-item.ts
import { Props, Prop, State, JSX } from "htmel";

@Props(["user"])
export class UserItem {
  @Prop user: { name: string; id: number } | null;
  @State private count: number = 0;

  increment(el) {
    this.count = this.count + 1;
    el.srcElement.innerText = this.count;
  }

  renderItems() {
    const userName = this?.user?.name;

    if (userName) {
      return (
        <li
          id="user-item"
          className="user-item"
          style={{
            margin: "10px 0",
            border: "1px solid #ddd",
            padding: "10px",
          }}
        >
          {userName || "Loading..."}
        </li>
      );
    }
  }

  render() {
    return (
      <div>
        {this.renderItems()}

        <button id="incrementButton" onclick={(el) => this.increment(el)}>
          {String(this.count)}
        </button>
      </div>
    );
  }
}

export default UserItem;
`;

export const usercss = `li {
    background: blue;
}`;

export const indexhtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Website</title>
  </head>
  <body>
    <h1>Welcome to My Website</h1>
    <p>This is the main page of the website.</p>
    <user-list class="user-list"></user-list>
    <script type="module" src="/public/main.js"></script>
  </body>
</html>

`;

export const mainjs = `console.log('new project generated)`;

export const maincss = `li {
    background-color: yellow;
}`;

export const compilesh = `#!/bin/bash

# Directory containing JavaScript files
js_dir="./public"

# Check if the directory exists
if [ ! -d "$js_dir" ]; then
    echo "Error: Directory '$js_dir' not found."
    exit 1
fi

tsc
echo "TypeScript components compiled."

find "$js_dir" -type f -name "*.js" -exec mv {} ./public/ \\;

find "$js_dir" -type d -empty -delete

echo "Build and flattening complete!"

rm ./public/main.js

npm run transpile
echo "JavaScript files transpiled to public"

# Delete JavaScript files
echo "Deleting JavaScript files from $js_dir ..."
find "$js_dir" -type f -name '*.js' ! -name 'main.js' -delete

echo "JavaScript files deleted successfully."
`;

export const webpackConfig = `const path = require("path");
const glob = require("glob");

module.exports = {
  entry: () => {
    const componentsPath = path.join(__dirname, "public");
    return glob.sync(path.join(componentsPath, "*.component.js"));
  },
  output: {
    path: path.resolve(__dirname, "public"),
  },
  resolve: {
    fallback: {
      http: false,
    },
  },
};
`;

export const tsConfig = `{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2015",
    "lib": ["dom", "es2015"],
    "module": "ES2015",
    "moduleResolution": "node",
    "jsx": "react",
    "jsxFactory": "JSX",
    "jsxFragmentFactory": "document.createDocumentFragment",
    "noImplicitOverride": false,
    "baseUrl": "./",
    "outDir": "./public",
    "noEmit": false,
    "paths": {
      "htmel": ["../node_modules/htmel/dist/script.js"]
    }
  }
}
`;

export const serverJS = `const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const server = http.createServer((req, res) => {
  let pathname = url.parse(req.url).pathname;

  // Map URL paths to file paths in the public directory
  let publicFilePath = path.join(__dirname, "public", pathname);

  // Serve index.html by default if URL ends with '/'
  if (publicFilePath.endsWith("/")) {
    publicFilePath = path.join(publicFilePath, "index.html");
  }

  // Determine file extension
  let extname = path.extname(publicFilePath);
  let contentType = "text/html";

  // Set content type based on file extension
  switch (extname) {
    case ".js":
      contentType = "text/javascript";
      break;
    case ".css":
      contentType = "text/css";
      break;
    case ".json":
      contentType = "application/json";
      break;
    case ".png":
      contentType = "image/png";
      break;
    case ".jpg":
      contentType = "image/jpg";
      break;
    case ".ico":
      contentType = "image/x-icon";
      break;
  }

  // Check if file exists in the public directory
  fs.readFile(publicFilePath, (publicErr, publicContent) => {
    if (!publicErr) {
      // Serve the file from the public directory
      res.writeHead(200, { "Content-Type": contentType });
      res.end(publicContent, "utf-8");
    } else {
      // Map URL paths to file paths in the node_modules directory
      let nodeModulesFilePath = path.join(__dirname, "node_modules", pathname);

      // Check if file exists in the node_modules directory
      fs.readFile(nodeModulesFilePath, (nodeModulesErr, nodeModulesContent) => {
        if (!nodeModulesErr) {
          // Serve the file from the node_modules directory
          res.writeHead(200, { "Content-Type": contentType });
          res.end(nodeModulesContent, "utf-8");
        } else {
          // Serve the file by pathname
          fs.readFile(pathname.slice(1), (err, content) => {
            if (err) {
              // File not found, return 404
              res.writeHead(404);
              res.end("404 Not Found");
            } else {
              // Serve the file with appropriate content type
              res.writeHead(200, { "Content-Type": contentType });
              res.end(content, "utf-8");
            }
          });
        }
      });
    }
  });
});

server.listen("4000", () => {
  console.log("Server running at http://127.0.0.1:4000/");
});`;

export const packageJsonContent = (projectName: string) => `{
"name": "${projectName}",
  "version": "0.0.1",
  "description": "Example project generated by htmel.cli",
  "scripts": {
    "start": "npm run compile && npx tsx server.ts",
    "compile": "bash compile.sh",
    "transpile": "npx webpack --config ./webpack.config.js"
  },
  "keywords": [
    "HTML",
    "Node.js",
    "website"
  ],
  "author": "Ashton James Snow Morris Jefferson",
  "license": "MIT",
  "dependencies": {
    "htmel": "git+https://github.com/presidentialsoftware/htmel.git#dist"
  },
  "devDependencies": {
    "glob": "^10.3.10",
    "typescript": "^5.2.2",
    "webpack": "^5.90.3",
    "webpack-cli": "^5.1.4",
    "tsx": "^4.19.1"
  }
      }`;
