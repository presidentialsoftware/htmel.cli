
# htmel CLI

The `htmel CLI` is a command-line interface for quickly setting up projects using the htmel library. With this CLI, you can easily create a new project directory with the necessary files and install the required npm packages.

## Features

- Create a new project directory with a predefined structure.
- Automatically generate essential project files.
- Install the required npm packages.
- Start the project immediately after setup.

## Installation

To install the `htmel CLI` globally, run the following command:

```bash
npm install -g htmel.cli
```

## Usage

### Creating a New Project

To create a new project, use the following command:

```bash
htmel create <project-name>
```

Replace `<project-name>` with the desired name for your project.

### Example

```bash
htmel create my-new-project
```

This command will:

1. Create a new directory named `my-new-project`.
2. Generate the following project structure:

```
my-new-project
├── components
│   ├── user-item.component.tsx
│   ├── user-list.component.ts
│   └── userlist.css
├── public
│   ├── index.html
│   ├── main.js
│   └── style.css
├── compile.sh
├── server.ts
├── tsconfig.json
├── webpack.config.js
└── package.json
```

3. Install the necessary npm packages.
4. Start the project using `npm start`.

## Contributing

If you would like to contribute to this CLI, feel free to fork the repository and submit a pull request. Any improvements, suggestions, or bug reports are welcome!
