package ai.firewall.plugin

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages

class OpenChatAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project: Project? = e.project
        Messages.showInfoMessage(project, "AI Firewall Chat will open (stub)", "AI Firewall")
        // TODO: open ToolWindow with embedded JCEF webview and connect to proxy
    }
}

