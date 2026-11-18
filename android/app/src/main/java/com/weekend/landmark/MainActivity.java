package com.weekend.landmark;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LmNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
