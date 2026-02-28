plugins {
    kotlin("jvm") version "1.9.0"
    id("org.jetbrains.intellij") version "1.15.0"
}

group = "ai.firewall"
version = "0.1.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation(kotlin("stdlib"))
}

intellij {
    version.set("2023.2")
    type.set("IC")
}

tasks {
    patchPluginXml {
        changeNotes.set("Initial AI Firewall JetBrains plugin skeleton")
    }
}

