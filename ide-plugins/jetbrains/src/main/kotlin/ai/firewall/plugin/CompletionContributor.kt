package ai.firewall.plugin

import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext

class AIFirewallCompletionContributor : CompletionContributor() {
    init {
        extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement(),
            object : CompletionProvider<CompletionParameters>() {
                override fun addCompletions(
                    parameters: CompletionParameters,
                    context: ProcessingContext,
                    resultSet: CompletionResultSet
                ) {
                    // Placeholder: call local proxy /estimate or /v1/chat/completions to get completion suggestions
                    // For now, provide a static suggestion to demonstrate plumbing
                    resultSet.addElement(LookupElementBuilder.create("aiFirewall_suggestion()"))
                }
            })
    }
}

