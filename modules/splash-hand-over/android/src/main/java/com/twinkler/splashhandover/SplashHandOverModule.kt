package com.twinkler.splashhandover

import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SplashHandOverModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SplashHandOver")

    AsyncFunction("waitAsync") { promise: Promise ->
      SplashHandOver.await(promise)
    }.runOnQueue(Queues.MAIN)
  }
}
