package com.yourstory.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Foreground service that keeps the app process (and so the WebView running a
 * turn) alive while the player has left the app, with an ongoing notification.
 * Without one, a backgrounded app is fair game for App Standby, Doze's network
 * cut-off and the low-memory killer, and a turn in flight dies with it
 * (decision 132). Whether it is enough with the screen off is a device check.
 *
 * Calls are keyed by a turn id from the page. Everything that touches the
 * shared state runs on the main looper, so begin and end are serialised, and
 * an end that overtakes a slow begin wins (see {@link #shouldStart}).
 */
public class TurnKeepAliveService extends Service {

    static final String CHANNEL_TURN = "turn";
    static final String CHANNEL_READY = "ready";
    static final int NOTIFICATION_ID_TURN = 1;
    static final int NOTIFICATION_ID_READY = 2;
    static final int NOTIFICATION_ID_ATTENTION = 3;
    private static final String EXTRA_TURN_ID = "turnId";

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    // The following three are read and written on the main looper only.
    private static TurnKeepAliveService instance;
    private static String currentTurnId;
    private static String endedTurnId;

    /**
     * Whether a begin for {@code pendingId} should keep the service running:
     * false when that turn has already ended. Pure, so the ordering rule is
     * the one thing here that does not depend on Android.
     */
    static boolean shouldStart(String pendingId, String endedId) {
        if (pendingId == null) return false;
        return !pendingId.equals(endedId);
    }

    /** Starts the service for a turn. Must be called while the app is visible. */
    static void begin(Context context, String turnId) {
        Intent intent = new Intent(context, TurnKeepAliveService.class);
        intent.putExtra(EXTRA_TURN_ID, turnId);
        ContextCompat.startForegroundService(context, intent);
    }

    /**
     * Ends a turn. An id other than the running turn's is ignored for the
     * service itself, but is remembered, so a begin still on its way for that
     * id is dropped when it arrives.
     */
    static void end(final String turnId) {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                endedTurnId = turnId;
                if (instance != null && turnId != null && turnId.equals(currentTurnId)) {
                    currentTurnId = null;
                    instance.stopSelf();
                }
            }
        });
    }

    /** Creates both notification channels (API 26+; older versions have none). */
    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel turn = new NotificationChannel(
            CHANNEL_TURN, "Turns in progress", NotificationManager.IMPORTANCE_LOW);
        turn.setSound(null, null);
        turn.setShowBadge(false);
        manager.createNotificationChannel(turn);
        NotificationChannel ready = new NotificationChannel(
            CHANNEL_READY, "Turns ready", NotificationManager.IMPORTANCE_DEFAULT);
        manager.createNotificationChannel(ready);
    }

    /** A tap on a notification brings the existing MainActivity forward. */
    static PendingIntent openAppIntent(Context context) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
            context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_TURN)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Your Story is writing your turn…")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openAppIntent(this))
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Android kills the app if startForeground does not follow
        // startForegroundService within a few seconds, so it comes first, even
        // for a begin that turns out to be too late.
        ensureChannels(this);
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID_TURN, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID_TURN, notification);
        }

        String turnId = intent == null ? null : intent.getStringExtra(EXTRA_TURN_ID);
        instance = this;
        if (!shouldStart(turnId, endedTurnId)) {
            currentTurnId = null;
            stopSelf();
        } else {
            currentTurnId = turnId;
        }
        return START_NOT_STICKY;
    }

    /** Android 15 caps dataSync at six hours a day; stop rather than be killed. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        stopSelf();
    }

    /** Swiping the app away ends the turn, so it must end the notification too. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (instance == this) {
            instance = null;
            currentTurnId = null;
        }
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
