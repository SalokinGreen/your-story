package com.yourstory.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // A plugin that lives in this project (not an npm package) is
        // registered before super.onCreate builds the bridge.
        registerPlugin(TurnKeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
