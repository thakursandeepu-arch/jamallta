package com.jamallta.films;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://jamallta.com/login/login.html";
    private static final String PREFS_NAME = "jamallta_webview";
    private static final String KEY_LAST_URL = "last_url";
    private static final int PERMISSION_REQUEST_CODE = 1001;
    private static final String NOTIFICATION_CHANNEL_ID = "jamallta_admin_updates";
    private WebView webView;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        webView = new WebView(this);
        setContentView(webView);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        createNotificationChannel();
        requestAppPermissions();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        webView.addJavascriptInterface(new AndroidBridge(), "JamalltaAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && isJamalltaUrl(uri.toString())) {
                    view.loadUrl(uri.toString());
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                saveLastUrl(url);
                CookieManager.getInstance().flush();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    request.grant(request.getResources());
                }
            }
        });
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        if (savedInstanceState == null) {
            webView.loadUrl(getStartUrl());
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) saveLastUrl(webView.getUrl());
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) saveLastUrl(webView.getUrl());
        CookieManager.getInstance().flush();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }

    private String getStartUrl() {
        String lastUrl = prefs.getString(KEY_LAST_URL, "");
        if (isJamalltaUrl(lastUrl)) return lastUrl;
        return APP_URL;
    }

    private void saveLastUrl(String url) {
        if (!isJamalltaUrl(url)) return;
        prefs.edit().putString(KEY_LAST_URL, url).apply();
    }

    private boolean isJamalltaUrl(String url) {
        if (url == null) return false;
        return url.startsWith("https://jamallta.com/")
            || url.startsWith("https://www.jamallta.com/");
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        String[] permissions;
        if (Build.VERSION.SDK_INT >= 33) {
            permissions = new String[] {
                Manifest.permission.POST_NOTIFICATIONS,
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO
            };
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            permissions = new String[] {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_EXTERNAL_STORAGE
            };
        } else {
            permissions = new String[] {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            };
        }

        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(permissions, PERMISSION_REQUEST_CODE);
                return;
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "Admin Updates",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Punch in, punch out, and admin update alerts");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void showNativeNotification(String title, String message) {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, PERMISSION_REQUEST_CODE);
            return;
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new android.app.Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            : new android.app.Notification.Builder(this);

        builder
            .setSmallIcon(R.drawable.app_icon)
            .setContentTitle(title == null || title.trim().isEmpty() ? "Jamallta" : title)
            .setContentText(message == null ? "" : message)
            .setStyle(new android.app.Notification.BigTextStyle().bigText(message == null ? "" : message))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(android.app.Notification.PRIORITY_HIGH);
        }

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), builder.build());
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void showNotification(String title, String message) {
            runOnUiThread(() -> showNativeNotification(title, message));
        }
    }
}
