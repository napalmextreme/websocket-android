package com.wsinspector

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

class WsRegistryModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  data class Conn(
    val id: String,
    val url: String,
    val state: String,
    val updatedAt: Long
  )

  data class Msg(
    val dir: String,
    val ts: Long,
    val data: String
  )

  private val conns = ConcurrentHashMap<String, Conn>()
  private val msgs = ConcurrentHashMap<String, MutableList<Msg>>()
  private val maxMsgsPerConn = 300

  override fun getName(): String = "WsRegistry"

  @ReactMethod
  fun upsertConnection(id: String, url: String, state: String, updatedAt: Double) {
    val ts = updatedAt.toLong()
    conns[id] = Conn(id = id, url = url, state = state, updatedAt = ts)
  }

  @ReactMethod
  fun removeConnection(id: String) {
    conns.remove(id)
    msgs.remove(id)
  }

  @ReactMethod
  fun clear() {
    conns.clear()
    msgs.clear()
  }

  @ReactMethod
  fun addMessage(id: String, dir: String, ts: Double, data: String) {
    val list = msgs.getOrPut(id) {
      Collections.synchronizedList(mutableListOf())
    }

    // limita tamanho de mensagem (evita travar com payload gigante)
    val safeData = if (data.length > 5000) data.substring(0, 5000) + "…(truncado)" else data

    synchronized(list) {
      list.add(Msg(dir = dir, ts = ts.toLong(), data = safeData))
      val extra = list.size - maxMsgsPerConn
      if (extra > 0) {
        // remove do começo (mais antigas)
        for (i in 0 until extra) {
          if (list.isNotEmpty()) list.removeAt(0)
        }
      }
    }
  }

  @ReactMethod
  fun clearMessages(id: String) {
    msgs.remove(id)
  }

  @ReactMethod
  fun getMessages(id: String, promise: Promise) {
    try {
      val list = msgs[id]
      val arr = Arguments.createArray()
      if (list != null) {
        val snapshot: List<Msg>
        synchronized(list) {
          snapshot = list.toList()
        }
        // retorna do mais recente pro mais antigo
        snapshot.asReversed().forEach { m ->
          val map = Arguments.createMap()
          map.putString("dir", m.dir)
          map.putDouble("ts", m.ts.toDouble())
          map.putString("data", m.data)
          arr.pushMap(map)
        }
      }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("WS_REGISTRY_ERROR", e)
    }
  }

  @ReactMethod
  fun getConnections(promise: Promise) {
    try {
      val arr = Arguments.createArray()
      conns.values
        .sortedWith(compareByDescending<Conn> { it.updatedAt }.thenBy { it.url })
        .forEach { c ->
          val m = Arguments.createMap()
          m.putString("id", c.id)
          m.putString("url", c.url)
          m.putString("state", c.state)
          m.putDouble("updatedAt", c.updatedAt.toDouble())
          arr.pushMap(m)
        }
      promise.resolve(arr)
    } catch (e: Exception) {
      promise.reject("WS_REGISTRY_ERROR", e)
    }
  }
}


