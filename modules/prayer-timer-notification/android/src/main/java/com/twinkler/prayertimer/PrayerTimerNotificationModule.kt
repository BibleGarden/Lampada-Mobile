package com.twinkler.prayertimer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.max

class PrayerTimerNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PrayerTimerNotification")

    AsyncFunction("startCountdownAsync") { endsAtMs: Double, title: String ->
      showCountdown(endsAtMs.toLong(), title)
    }

    AsyncFunction("stopCountdownAsync") {
      notificationManager().cancel(NOTIFICATION_ID)
    }
  }

  private fun context(): Context =
    appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

  private fun notificationManager(): NotificationManager =
    context().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Таймер молитвы",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Оставшееся время текущей молитвы"
      enableVibration(false)
      setSound(null, null)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  @Suppress("DEPRECATION")
  private fun showCountdown(endsAtMs: Long, title: String) {
    val context = context()
    val manager = notificationManager()
    ensureChannel(manager)

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        context,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }

    builder
      .setSmallIcon(R.drawable.ic_prayer_timer)
      .setContentTitle(title)
      .setContentText("До завершения молитвы")
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setWhen(endsAtMs)
      .setUsesChronometer(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setAutoCancel(false)
      .setContentIntent(contentIntent)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      builder.setChronometerCountDown(true)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder.setTimeoutAfter(max(1_000L, endsAtMs - System.currentTimeMillis()))
    }

    manager.notify(NOTIFICATION_ID, builder.build())
  }

  private companion object {
    const val CHANNEL_ID = "twinkler_prayer_timer"
    const val NOTIFICATION_ID = 4_731
  }
}
