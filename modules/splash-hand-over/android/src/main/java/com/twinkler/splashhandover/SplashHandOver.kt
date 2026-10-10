package com.twinkler.splashhandover

import android.annotation.TargetApi
import android.app.Activity
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.window.SplashScreenView
import expo.modules.kotlin.Promise

/**
 * Конец передачи системного сплэша приложению на Android 12+.
 *
 * После первого кадра окна система копирует сплэш в процесс приложения:
 * добавляет SplashScreenView в DecorView и ждёт, пока главный поток его
 * нарисует, — не дольше [TRANSFER_TIMEOUT_MS]. Просроченная передача оставляет
 * окну анимацию starting_reveal, которая не заканчивается. Поэтому тяжёлый
 * интерфейс монтируется только после неё: когда expo-splash-screen убрал
 * SplashScreenView из DecorView (это происходит после отчёта системе), но не
 * позже, чем система сама перестанет ждать. Если за срок после первого кадра
 * сплэш так и не пришёл (снимок вместо сплэша, пересоздание активности), система
 * его уже не пришлёт. До Android 12 системной передачи нет.
 *
 * Всё состояние живёт на главном потоке.
 */
object SplashHandOver {
  /** Срок ожидания передачи в ActivityRecord (TRANSFER_SPLASH_SCREEN_TIMEOUT). */
  private const val TRANSFER_TIMEOUT_MS = 2000L

  private val handler = Handler(Looper.getMainLooper())
  private var done = true
  private val waiters = mutableListOf<Promise>()
  private var finishCurrent: (() -> Unit)? = null

  fun onActivityCreated(activity: Activity) {
    finishCurrent?.invoke()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      finish()
      return
    }
    done = false
    observe(activity.window.decorView as ViewGroup)
  }

  fun await(promise: Promise) {
    if (done) promise.resolve(null) else waiters.add(promise)
  }

  @TargetApi(Build.VERSION_CODES.S)
  private fun observe(decor: ViewGroup) {
    val deadline = Runnable { finishCurrent?.invoke() }
    val firstDraw = object : ViewTreeObserver.OnDrawListener {
      private var drawn = false

      override fun onDraw() {
        if (drawn) return
        drawn = true
        handler.postDelayed(deadline, TRANSFER_TIMEOUT_MS)
        // Снимать слушатель во время onDraw нельзя.
        handler.post { decor.viewTreeObserver.removeOnDrawListener(this) }
      }
    }
    decor.viewTreeObserver.addOnDrawListener(firstDraw)
    decor.setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
      // Передача началась, и системный срок уже идёт: новый отсчёт от этого
      // момента заведомо переживает его. Обычно раньше приходит удаление
      // SplashScreenView; срок нужен, если expo-splash-screen его не удалит
      // (на Android 12–13 он снимает слушатель, когда активность уходит в фон).
      override fun onChildViewAdded(parent: View, child: View) {
        if (child !is SplashScreenView) return
        handler.removeCallbacks(deadline)
        handler.postDelayed(deadline, TRANSFER_TIMEOUT_MS)
      }

      override fun onChildViewRemoved(parent: View, child: View) {
        if (child is SplashScreenView) finishCurrent?.invoke()
      }
    })
    finishCurrent = {
      finishCurrent = null
      handler.removeCallbacks(deadline)
      decor.setOnHierarchyChangeListener(null)
      if (decor.viewTreeObserver.isAlive) decor.viewTreeObserver.removeOnDrawListener(firstDraw)
      finish()
    }
  }

  private fun finish() {
    done = true
    waiters.forEach { it.resolve(null) }
    waiters.clear()
  }
}
