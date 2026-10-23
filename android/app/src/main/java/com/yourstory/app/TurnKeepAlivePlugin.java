package com.yourstory.app;

import android.Manifest;
import android.app.Notification;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridge between the page and {@link TurnKeepAliveService} (decision 132):
 * the page says when a turn begins and ends, and asks for a "your turn is
 * ready" ping when one finished while the player was away. Every call carries
 * the turn's id so a late or repeated call cannot affect another turn.
 */
@CapacitorPlugin(
    name = "TurnKeepAlive",
    permissions = @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
)
public class TurnKeepAlivePlugin extends Plugin {

    private static final String ALIAS_NOTIFICATIONS = "notifications";

    // Written on the lifecycle and plugin threads, read on both.
    private volatile boolean inForeground = true;
    private volatile String lastEndedTurnId;

    /**
     * Starts the service at once. It does not wait for the notification
     * permission: a foreground service runs without it, and only its
     * notification is hidden.
     */
    @PluginMethod
    public void begin(PluginCall call) {
        String turnId = call.getString("turnId");
        if (turnId == null) {
            call.reject("turnId is required");
            return;
        }
        try {
            TurnKeepAliveService.begin(getContext(), turnId);
            call.resolve();
        } catch (RuntimeException e) {
            // E.g. Android refusing a foreground start; the turn still runs.
            call.reject("Could not start the keep-alive service: " + e.getMessage());
        }
    }

    /** Ends a turn; the service stops if it is still running that turn. */
    @PluginMethod
    public void end(PluginCall call) {
        String turnId = call.getString("turnId");
        if (turnId == null) {
            call.reject("turnId is required");
            return;
        }
        lastEndedTurnId = turnId;
        TurnKeepAliveService.end(turnId);
        call.resolve();
    }

    /**
     * Posts "your turn is ready" only if the app is not on screen, the
     * permission is granted, and the id is the turn that just ended.
     */
    @PluginMethod
    public void notifyReady(PluginCall call) {
        String turnId = call.getString("turnId");
        String title = call.getString("title", "Your turn is ready");
        String body = call.getString("body", "");
        if (turnId == null || !turnId.equals(lastEndedTurnId) || inForeground || !canNotify()) {
            call.resolve();
            return;
        }
        Context context = getContext();
        TurnKeepAliveService.ensureChannels(context);
        Notification notification = new NotificationCompat.Builder(context, TurnKeepAliveService.CHANNEL_READY)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(TurnKeepAliveService.openAppIntent(context))
            .build();
        try {
            NotificationManagerCompat.from(context).notify(TurnKeepAliveService.NOTIFICATION_ID_READY, notification);
        } catch (SecurityException e) {
            // Permission revoked between the check and the post: nothing to do.
        }
        call.resolve();
    }

    /** Asks for POST_NOTIFICATIONS on Android 13+; resolves at once below that. */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState(ALIAS_NOTIFICATIONS) != PermissionState.GRANTED) {
            requestPermissionForAlias(ALIAS_NOTIFICATIONS, call, "notificationPermissionResult");
        } else {
            call.resolve();
        }
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        // Granted or not, the turn is unaffected; the JS side never reads it.
        call.resolve();
    }

    private boolean canNotify() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    @Override
    protected void handleOnResume() {
        inForeground = true;
        // A "ready" ping is stale once the player is back.
        NotificationManagerCompat.from(getContext()).cancel(TurnKeepAliveService.NOTIFICATION_ID_READY);
    }

    @Override
    protected void handleOnPause() {
        inForeground = false;
    }
}
