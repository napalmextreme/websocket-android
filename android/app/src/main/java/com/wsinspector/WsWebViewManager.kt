package com.wsinspector

import android.webkit.WebSettings
import android.webkit.WebView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class WsWebViewManager(private val reactContext: ReactApplicationContext) :
  SimpleViewManager<WebView>() {

  override fun getName(): String = "WsWebView"

  override fun createViewInstance(reactContext: ThemedReactContext): WebView {
    val webView = WebView(reactContext)
    
    // Configurações do WebView
    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      databaseEnabled = true
      cacheMode = WebSettings.LOAD_DEFAULT
      mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    }

    // Obtém WsRegistry
    val registryModule = this.reactContext
      .getNativeModule(WsRegistryModule::class.java)

    if (registryModule != null) {
      // Adiciona JavaScript Interface
      webView.addJavascriptInterface(
        WsJavascriptInterface(registryModule),
        "WsInterface"
      )

      // Define WebViewClient customizado
      webView.webViewClient = WsWebViewClient(registryModule)
    }

    return webView
  }

  @ReactProp(name = "source")
  fun setSource(view: WebView, url: String?) {
    url?.let {
      view.loadUrl(it)
    }
  }
}

