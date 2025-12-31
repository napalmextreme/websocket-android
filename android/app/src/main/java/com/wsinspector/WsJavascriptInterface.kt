package com.wsinspector

import android.util.Log
import android.webkit.JavascriptInterface

class WsJavascriptInterface(private val registry: WsRegistryModule) {
  companion object {
    private const val TAG = "WsJsInterface"
  }

  @JavascriptInterface
  fun onWebSocketCreated(id: String, url: String) {
    Log.d(TAG, "WS Created: $id -> $url")
    registry.upsertConnection(
      id,
      url,
      "CREATING",
      System.currentTimeMillis().toDouble()
    )
  }

  @JavascriptInterface
  fun onWebSocketOpen(id: String, url: String) {
    Log.d(TAG, "WS Open: $id")
    registry.upsertConnection(
      id,
      url,
      "OPEN",
      System.currentTimeMillis().toDouble()
    )
  }

  @JavascriptInterface
  fun onWebSocketMessage(id: String, direction: String, payload: String) {
    Log.d(TAG, "WS Message: $id $direction ${payload.take(50)}")
    registry.addMessage(
      id,
      direction,
      System.currentTimeMillis().toDouble(),
      payload
    )
  }

  @JavascriptInterface
  fun onWebSocketClose(id: String, url: String, code: Int, reason: String) {
    Log.d(TAG, "WS Close: $id code=$code reason=$reason")
    registry.upsertConnection(
      id,
      url,
      "CLOSED",
      System.currentTimeMillis().toDouble()
    )
  }

  @JavascriptInterface
  fun onWebSocketError(id: String, url: String) {
    Log.d(TAG, "WS Error: $id")
    registry.upsertConnection(
      id,
      url,
      "ERROR",
      System.currentTimeMillis().toDouble()
    )
  }
}

