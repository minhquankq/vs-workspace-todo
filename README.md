# Workspace Todo

A VS Code extension that provides a workspace-scoped todo list with markdown support, accessible from the Activity Bar.

## Features

- **Workspace-scoped** — todos are saved per workspace and persist across sessions
- **Markdown support** — todo content is rendered as markdown (bold, italic, code, links, etc.)
- **Inline editing** — click any todo to edit it in place
- **Drag-and-drop reordering** — drag todos to rearrange them
- **Search** — filter todos in real time by text
- **Hide completed** — toggle visibility of completed todos
- **Clear completed** — remove all completed todos at once

## Usage

1. Click the **Workspace Todo** icon in the Activity Bar to open the panel.
2. Type a todo in the input at the bottom and press **Enter** to add it.
3. Click the checkbox to mark a todo as complete.
4. Click the todo text to edit it inline.
5. Use the search bar to filter todos by content.
6. Use the toolbar menu (⋮) to hide completed todos or clear them all.

## Commands

| Command | Description |
|---|---|
| `Workspace Todo: Clear Completed Todos` | Removes all completed todos |

## Settings

| Setting | Default | Description |
|---|---|---|
| `workspace-todo.hideCompleted` | `false` | Hide completed todos from the list |

## Development

### Prerequisites

- Node.js
- npm

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run watch
```

### Package

```bash
npm run package
```

This produces a `.vsix` file that can be installed via **Extensions: Install from VSIX** in VS Code.

## Tech Stack

- **TypeScript** — extension host and webview
- **React** — webview UI
- **esbuild** — bundler for both extension and webview
- **marked** — markdown rendering
- **SortableJS** — drag-and-drop reordering

## License

[MIT](LICENSE)
