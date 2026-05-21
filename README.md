# Workspace Todo

A VS Code extension that provides a workspace-scoped todo list with markdown support, accessible from the Activity Bar.

![Demo](media/demo-1.gif)

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

## Keyboard Shortcuts

These shortcuts work in both the **add** input and the **edit** textarea. Select text first to format a selection, or press the shortcut with no selection to insert markers with the cursor placed between them.

| Shortcut | Mac | Effect |
| -------- | --- | ------ |
| `Ctrl+B` | `⌘B` | **Bold** — wraps with `**...**` |
| `Ctrl+I` | `⌘I` | *Italic* — wraps with `*...*` |
| `Ctrl+U` | `⌘U` | Underline — wraps with `<u>...</u>` |
| `Alt+↵` | `⌘↵` | Submit / save the todo |
| `Escape` | `Escape` | Cancel editing |

## Commands

| Command                                 | Description                 |
| --------------------------------------- | --------------------------- |
| `Workspace Todo: Clear Completed Todos` | Removes all completed todos |

## Settings

| Setting                        | Default | Description                        |
| ------------------------------ | ------- | ---------------------------------- |
| `workspace-todo.hideCompleted` | `false` | Hide completed todos from the list |

## Tech Stack

- **TypeScript** — extension host and webview
- **React** — webview UI
- **esbuild** — bundler for both extension and webview
- **marked** — markdown rendering
- **SortableJS** — drag-and-drop reordering

## License

[MIT](LICENSE)
