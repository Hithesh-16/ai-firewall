package ai.firewall.plugin

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.content.ContentFactory

class ChatToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // Simple JCEF browser pointing to local dashboard chat view (or a bundled web UI)
        val browser = JBCefBrowser("about:blank")
        val content = ContentFactory.SERVICE.getInstance().createContent(browser.component, "", false)
        toolWindow.contentManager.addContent(content)
        // TODO: load local webview UI that communicates with local proxy
    }
}

