import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('sourceMapVisualization.show', () => {
      vscode.window.setStatusBarMessage('Show source map visualization...', show(context.extensionUri))
    }),
  )
}

const viewType = 'sourceMapVisualization'

async function show(extensionUri: vscode.Uri) {
  const editor = vscode.window.activeTextEditor
  if (!editor)
    return

  const document = editor.document

  const file = document.fileName
  const dir = file.replace(/\/[^\/]+$/, '')
  const fileName = file.split('/').pop()
  if (!fileName)
    return

  const fileMetas = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir))
  let mapFileName = fileMetas.find(([name]) => name === `${fileName}.map`)?.[0]
  mapFileName ??= fileMetas.find(([name]) => name.startsWith(fileName?.split('.')[0]) && name.endsWith('.map'))?.[0]
  if (!mapFileName) {
    vscode.window.setStatusBarMessage('Source map file not found!', 5000)
    return
  }

  const mapFile = `${dir}/${mapFileName}`

  const code = document.getText(editor.selection) || await vscode.workspace.fs.readFile(vscode.Uri.file(file)).then(buffer => new TextDecoder('utf-8').decode(buffer))
  const map = await vscode.workspace.fs.readFile(vscode.Uri.file(mapFile)).then(buffer => new TextDecoder('utf-8').decode(buffer))

  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined

  const panel = vscode.window.createWebviewPanel(
    viewType,
    'Source Map Visualization',
    column || vscode.ViewColumn.One,
    {
      enableScripts: true,
    },
  )

  panel.webview.html = getHtmlForWebview(panel.webview, extensionUri)
  panel.webview.postMessage({
    command: 'update',
    data: { code, map },
  })
}

function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
  // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
  const mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'res', 'main.js'))
  const codeScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'res', 'code.js'))

  // Do the same for the stylesheet.
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'res', 'style.css'))

  // Use a nonce to only allow a specific script to be run.
  const nonce = getNonce()

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <!-- <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"> -->
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${styleUri}" rel="stylesheet">
    </head>
    <body>
      <div id="toolbar">
        <section>
          <h2>Original code</h2>
          <div id="fileListParent"><select id="fileList"></select></div>
        </section>
        <section>
          <h2>Generated code</h2>
        </section>
      </div>
      <div id="statusBar">
        <section>
          <div id="originalStatus"></div>
        </section>
        <section>
          <div id="generatedStatus"></div>
        </section>
      </div>
      <script nonce="${nonce}" src="${mainScriptUri}"></script>
      <script nonce="${nonce}" src="${codeScriptUri}"></script>
    </body>
    </html>`
}

function getNonce() {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length))

  return text
}
