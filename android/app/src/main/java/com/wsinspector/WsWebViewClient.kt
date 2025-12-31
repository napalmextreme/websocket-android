package com.wsinspector

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.util.Log

class WsWebViewClient(private val registry: WsRegistryModule) : WebViewClient() {
  companion object {
    private const val TAG = "WsWebViewClient"
  }

  override fun shouldInterceptRequest(
    view: WebView?,
    request: WebResourceRequest?
  ): WebResourceResponse? {
    request?.let { req ->
      val url = req.url?.toString() ?: ""
      val headers = req.requestHeaders

      // Detecta handshake WebSocket (Upgrade: websocket)
      if (headers != null && 
          (headers["Upgrade"]?.contains("websocket", ignoreCase = true) == true ||
           headers["Connection"]?.contains("Upgrade", ignoreCase = true) == true ||
           url.startsWith("ws://") || url.startsWith("wss://"))) {
        
        val wsId = java.util.UUID.randomUUID().toString()
        
        Log.d(TAG, "WebSocket detectado via intercept: $url")
        
        // Registra no WsRegistry
        registry.upsertConnection(
          wsId,
          url,
          "OPEN",
          System.currentTimeMillis().toDouble()
        )
      }
    }

    return super.shouldInterceptRequest(view, request)
  }

  override fun onPageFinished(view: WebView?, url: String?) {
    super.onPageFinished(view, url)
    
    // Injeta script mais robusto após carregamento da página
    view?.let { webView ->
      injectDeepWebSocketHook(webView)
    }
  }

  private fun injectDeepWebSocketHook(webView: WebView) {
    val script = """
      (function() {
        if (window.__WS_KOTLIN_HOOK_INSTALLED__) return;
        window.__WS_KOTLIN_HOOK_INSTALLED__ = true;
        
        console.log('[WS-Kotlin] Hook instalado');
        
        const OriginalWebSocket = window.WebSocket;
        if (!OriginalWebSocket) {
          console.warn('[WS-Kotlin] WebSocket não disponível');
          return;
        }
        
        window.WebSocket = function(url, protocols) {
          console.log('[WS-Kotlin] Nova conexão WebSocket:', url);
          
          let ws;
          try {
            ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
          } catch(e) {
            console.error('[WS-Kotlin] Erro ao criar WebSocket:', e);
            throw e;
          }
          
          const wsId = Math.random().toString(36).slice(2) + Date.now();
          ws.__ws_id = wsId;
          ws.__ws_url = String(url);
          
          // Notifica Kotlin via interface
          if (window.WsInterface) {
            window.WsInterface.onWebSocketCreated(wsId, String(url));
          }
          
          const origSend = ws.send;
          ws.send = function(data) {
            const payload = typeof data === 'string' ? data : '[binary]';
            console.log('[WS-Kotlin] SEND:', payload.substring(0, 100));
            if (window.WsInterface) {
              window.WsInterface.onWebSocketMessage(wsId, 'OUT', payload);
            }
            return origSend.apply(ws, arguments);
          };
          
          ws.addEventListener('open', function() {
            console.log('[WS-Kotlin] OPEN:', url);
            if (window.WsInterface) {
              window.WsInterface.onWebSocketOpen(wsId, String(url));
            }
          });
          
          ws.addEventListener('message', function(ev) {
            const payload = typeof ev.data === 'string' ? ev.data : '[binary]';
            console.log('[WS-Kotlin] MESSAGE:', payload.substring(0, 100));
            if (window.WsInterface) {
              window.WsInterface.onWebSocketMessage(wsId, 'IN', payload);
            }
          });
          
          ws.addEventListener('close', function(ev) {
            console.log('[WS-Kotlin] CLOSE:', url, ev.code, ev.reason);
            if (window.WsInterface) {
              window.WsInterface.onWebSocketClose(wsId, String(url), ev.code || 0, ev.reason || '');
            }
          });
          
          ws.addEventListener('error', function() {
            console.error('[WS-Kotlin] ERROR:', url);
            if (window.WsInterface) {
              window.WsInterface.onWebSocketError(wsId, String(url));
            }
          });
          
          return ws;
        };
        
        window.WebSocket.prototype = OriginalWebSocket.prototype;
        window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
        window.WebSocket.OPEN = OriginalWebSocket.OPEN;
        window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
        window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
      })();
    """.trimIndent()
    
    webView.evaluateJavascript(script, null)
  }
}

