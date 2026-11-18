package kr.landmarkstamp.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 랜드마크 앱 전용 기능.
 * - scanGallery: 사진첩의 사진에서 '찍은 위치와 날짜'만 읽는다 (사진 내용은 보지 않고, 기기 밖으로 보내지 않는다)
 * - thumb: 지도에 올리기로 한 사진의 작은 미리보기
 * - openApp: 네이버 지도 같은 다른 앱 열기 (없으면 웹 주소로)
 */
@CapacitorPlugin(
    name = "LmNative",
    permissions = {
        @Permission(alias = "photos", strings = { "android.permission.READ_MEDIA_IMAGES", "android.permission.ACCESS_MEDIA_LOCATION" }),
        @Permission(alias = "photosLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE, "android.permission.ACCESS_MEDIA_LOCATION" }),
        @Permission(alias = "photosOld", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class LmNativePlugin extends Plugin {

    private volatile boolean stop = false;

    private String alias() {
        if (Build.VERSION.SDK_INT >= 33) return "photos";
        if (Build.VERSION.SDK_INT >= 29) return "photosLegacy";
        return "photosOld";
    }

    @PluginMethod
    public void scanGallery(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "photosCallback");
            return;
        }
        doScan(call);
    }

    @PermissionCallback
    private void photosCallback(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) doScan(call);
        else call.reject("denied");
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stop = true;
        call.resolve();
    }

    private void doScan(final PluginCall call) {
        stop = false;
        new Thread(() -> {
            try {
                JSArray items = new JSArray();
                int total = 0, noLoc = 0, done = 0;
                long last = 0;
                String[] proj = { MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.SIZE };
                /* 사진에 적힌 시각은 찍은 곳(한국) 시계로 본다 */
                SimpleDateFormat fmt = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
                fmt.setTimeZone(TimeZone.getTimeZone("Asia/Seoul"));
                Cursor c = getContext().getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, null, null, MediaStore.Images.Media.DATE_ADDED + " DESC");
                if (c != null) {
                    try {
                        total = c.getCount();
                        while (c.moveToNext()) {
                            if (stop) break;
                            long id = c.getLong(0);
                            long taken = c.isNull(1) ? 0 : c.getLong(1);
                            long added = c.getLong(2) * 1000L;
                            long size = c.getLong(3);
                            Uri u = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                            if (Build.VERSION.SDK_INT >= 29) {
                                try { u = MediaStore.setRequireOriginal(u); } catch (Exception ignored) {}
                            }
                            double[] ll = null;
                            long at = 0;
                            InputStream in = null;
                            try {
                                in = getContext().getContentResolver().openInputStream(u);
                                if (in != null) {
                                    ExifInterface ex = new ExifInterface(in);
                                    ll = ex.getLatLong();
                                    String d = ex.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
                                    if (d == null) d = ex.getAttribute(ExifInterface.TAG_DATETIME);
                                    if (d != null) {
                                        try { Date dt = fmt.parse(d); if (dt != null) at = dt.getTime(); } catch (Exception ignored) {}
                                    }
                                }
                            } catch (Exception ignored) {
                            } finally {
                                if (in != null) { try { in.close(); } catch (Exception ignored) {} }
                            }
                            done++;
                            if (ll != null && !(ll[0] == 0 && ll[1] == 0) && !Double.isNaN(ll[0]) && !Double.isNaN(ll[1])) {
                                JSArray it = new JSArray();
                                it.put(String.valueOf(id));
                                it.put(ll[0]);
                                it.put(ll[1]);
                                it.put(at > 0 ? at : (taken > 0 ? taken : added));
                                it.put(at > 0 ? 1 : 0);
                                it.put(size);
                                items.put(it);
                            } else {
                                noLoc++;
                            }
                            long now = System.currentTimeMillis();
                            if (now - last > 300) {
                                last = now;
                                JSObject p = new JSObject();
                                p.put("done", done);
                                p.put("total", total);
                                notifyListeners("galleryProgress", p);
                            }
                        }
                    } finally {
                        c.close();
                    }
                }
                JSObject r = new JSObject();
                r.put("items", items);
                r.put("total", total);
                r.put("noLoc", noLoc);
                r.put("stopped", stop);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("scan failed");
            }
        }).start();
    }

    @PluginMethod
    public void thumb(final PluginCall call) {
        final long id;
        try { id = Long.parseLong(call.getString("id", "0")); } catch (Exception e) { call.reject("bad id"); return; }
        Integer sz = call.getInt("size", 480);
        final int size = Math.max(120, Math.min(1024, sz == null ? 480 : sz));
        new Thread(() -> {
            try {
                Uri u = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                Bitmap b;
                if (Build.VERSION.SDK_INT >= 29) {
                    b = getContext().getContentResolver().loadThumbnail(u, new Size(size, size), null);
                } else {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    InputStream in = getContext().getContentResolver().openInputStream(u);
                    BitmapFactory.decodeStream(in, null, o);
                    if (in != null) in.close();
                    int s = 1;
                    while (Math.max(o.outWidth, o.outHeight) / (s * 2) >= size) s *= 2;
                    BitmapFactory.Options o2 = new BitmapFactory.Options();
                    o2.inSampleSize = s;
                    InputStream in2 = getContext().getContentResolver().openInputStream(u);
                    b = BitmapFactory.decodeStream(in2, null, o2);
                    if (in2 != null) in2.close();
                }
                if (b == null) { call.reject("no image"); return; }
                ByteArrayOutputStream os = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.JPEG, 72, os);
                b.recycle();
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(os.toByteArray(), Base64.NO_WRAP));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("thumb failed");
            }
        }).start();
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String url = call.getString("url"), fb = call.getString("fallback");
        if (url == null || !(url.startsWith("nmap://") || url.startsWith("https://"))) { call.reject("bad url"); return; }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                if (fb != null && fb.startsWith("https://")) {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(fb));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                }
                call.resolve();
            } catch (Exception e2) {
                call.reject("cannot open");
            }
        }
    }
}
