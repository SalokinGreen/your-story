package com.yourstory.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Saves a file the player asked to download straight into the public
 * Downloads folder ("Downloads/Your Story"), with no share sheet. The author
 * found the share sheet, which asks where to send the file instead of saving
 * it, "very annoying" on the APK. iOS has no Downloads folder and keeps the
 * share sheet; this plugin is Android only.
 *
 * Android 10+ writes through MediaStore.Downloads, which needs no permission.
 * Android 7-9 writes to the public Downloads directory, which needs
 * WRITE_EXTERNAL_STORAGE (declared for API 28 and below only).
 */
@CapacitorPlugin(
    name = "FileSaver",
    permissions = @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
)
public class FileSaverPlugin extends Plugin {

    private static final String ALIAS_STORAGE = "storage";
    private static final String FOLDER = "Your Story";

    // The write is kept off the main thread whichever thread the call or the
    // permission callback arrives on.
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String name = call.getString("name");
        String base64 = call.getString("base64");
        if (name == null || name.isEmpty() || base64 == null) {
            call.reject("name and base64 are required");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState(ALIAS_STORAGE) != PermissionState.GRANTED) {
            requestPermissionForAlias(ALIAS_STORAGE, call, "storagePermissionResult");
            return;
        }
        write(call);
    }

    @PermissionCallback
    private void storagePermissionResult(PluginCall call) {
        if (getPermissionState(ALIAS_STORAGE) == PermissionState.GRANTED) {
            write(call);
        } else {
            call.reject("Storage permission was denied, so the file could not be saved to Downloads.");
        }
    }

    private void write(final PluginCall call) {
        final String name = sanitize(call.getString("name"));
        final String mimeType = call.getString("mimeType", "application/octet-stream");
        final String base64 = call.getString("base64");
        io.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    String saved = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? writeWithMediaStore(name, mimeType, bytes)
                        : writeToPublicDirectory(name, mimeType, bytes);
                    JSObject result = new JSObject();
                    result.put("path", Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER + "/" + saved);
                    call.resolve(result);
                } catch (Exception e) {
                    String message = e.getMessage();
                    call.reject(message != null ? message : e.toString());
                }
            }
        });
    }

    /** Android 10+: MediaStore picks a unique name when one already exists. */
    private String writeWithMediaStore(String name, String mimeType, byte[] bytes) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IOException("Could not create the file in Downloads");
        }
        try {
            OutputStream out = resolver.openOutputStream(uri);
            if (out == null) {
                throw new IOException("Could not open the file in Downloads");
            }
            try {
                out.write(bytes);
            } finally {
                out.close();
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
        } catch (IOException | RuntimeException e) {
            // Do not leave a half-written, invisible pending file behind.
            resolver.delete(uri, null, null);
            throw e;
        }
        String actual = queryDisplayName(resolver, uri);
        return actual != null ? actual : name;
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (RuntimeException e) {
            // The name is only for the message; fall back to the requested one.
        }
        return null;
    }

    /** Android 7-9: a plain file in the public Downloads folder. */
    private String writeToPublicDirectory(String name, String mimeType, byte[] bytes) throws IOException {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
        if (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()) {
            throw new IOException("Could not create the Downloads/" + FOLDER + " folder");
        }
        File target = uniqueFile(dir, name);
        FileOutputStream out = new FileOutputStream(target);
        try {
            out.write(bytes);
        } finally {
            out.close();
        }
        // Make it show up in the Files app and over USB without a reboot.
        MediaScannerConnection.scanFile(getContext(), new String[] { target.getAbsolutePath() }, new String[] { mimeType }, null);
        return target.getName();
    }

    /** "a.json" taken: "a (1).json", "a (2).json", ... */
    private File uniqueFile(File dir, String name) {
        File candidate = new File(dir, name);
        if (!candidate.exists()) {
            return candidate;
        }
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int n = 1; n < 10000; n++) {
            candidate = new File(dir, base + " (" + n + ")" + ext);
            if (!candidate.exists()) {
                return candidate;
            }
        }
        return new File(dir, base + " (" + System.currentTimeMillis() + ")" + ext);
    }

    /** A file name only: no path separators, never empty. */
    private String sanitize(String name) {
        String clean = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return clean.isEmpty() ? "download" : clean;
    }
}
