package in.versanya.pocketwise

import android.graphics.BitmapFactory
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import java.util.Locale

/// Capacitor bridge for bundled, on-device Google ML Kit text recognition.
/// OCR data stays on-device; the JS layer receives geometry and confidence only.
@CapacitorPlugin(name = "PocketWiseNativeOCR")
class PocketWiseNativeOCRPlugin : Plugin() {
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", true)
        result.put("engine", "Google ML Kit")
        call.resolve(result)
    }

    @PluginMethod
    fun recognize(call: PluginCall) {
        val dataUrl = call.getString("imageDataUrl")
        if (dataUrl.isNullOrBlank() || !dataUrl.contains(',')) {
            call.reject("A base64 image data URL is required.", "INVALID_IMAGE")
            return
        }
        val encoded = dataUrl.substringAfter(',', "")
        if (encoded.length > 24_000_000) {
            call.reject("The image exceeds the native OCR size limit.", "INVALID_IMAGE")
            return
        }

        val bitmap = try {
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (_: Exception) {
            null
        }
        if (bitmap == null) {
            call.reject("The image could not be decoded.", "INVALID_IMAGE")
            return
        }

        val image = try { InputImage.fromBitmap(bitmap, 0) } catch (error: Exception) {
            bitmap.recycle()
            call.reject("The image could not be prepared for OCR: ${error.localizedMessage}", "INVALID_IMAGE")
            return
        }
        val latin = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val wantsHindi = try {
            val hints = call.getArray("languageHints")
            hints != null && (0 until hints.length()).any { index -> hints.getString(index).lowercase(Locale.ROOT).startsWith("hi") }
        } catch (_: Exception) { false }
        val devanagari = if (wantsHindi) {
            TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
        } else null

        val tasks = mutableListOf(latin.process(image))
        if (devanagari != null) tasks.add(devanagari.process(image))
        Tasks.whenAllComplete(tasks).addOnCompleteListener { completed ->
            try {
                val results = completed.result ?: emptyList()
                val lines = mutableListOf<LineRecord>()
                for (task in results) {
                    if (!task.isSuccessful) continue
                    val text = task.result as? Text ?: continue
                    for (block in text.textBlocks) {
                        for (line in block.lines) {
                            val box = line.boundingBox ?: continue
                            val value = line.text.trim()
                            if (value.isEmpty() || box.width() <= 0 || box.height() <= 0) continue
                            lines.add(LineRecord(
                                value,
                                line.confidence.coerceIn(0f, 1f),
                                box.left.toDouble(), box.top.toDouble(),
                                box.width().toDouble(), box.height().toDouble()
                            ))
                        }
                    }
                }

                // Devanagari and Latin models may return an overlapping line. Keep the higher-confidence copy.
                val deduplicated = mutableListOf<LineRecord>()
                for (candidate in lines.sortedBy { it.y }) {
                    val duplicateIndex = deduplicated.indexOfFirst { existing ->
                        existing.text.equals(candidate.text, ignoreCase = true) &&
                            kotlin.math.abs(existing.x - candidate.x) < 8.0 &&
                            kotlin.math.abs(existing.y - candidate.y) < 8.0
                    }
                    if (duplicateIndex < 0) deduplicated.add(candidate)
                    else if (candidate.confidence > deduplicated[duplicateIndex].confidence) deduplicated[duplicateIndex] = candidate
                }
                deduplicated.sortWith(compareBy<LineRecord> { it.y }.thenBy { it.x })
                if (deduplicated.isEmpty()) {
                    call.reject("Google ML Kit found no readable text in the image.", "NO_TEXT")
                    return@addOnCompleteListener
                }

                val items = JSArray()
                deduplicated.forEach { line ->
                    val item = JSObject()
                    item.put("text", line.text)
                    item.put("confidence", line.confidence.toDouble())
                    val bounds = JSObject()
                    bounds.put("x", line.x)
                    bounds.put("y", line.y)
                    bounds.put("width", line.width)
                    bounds.put("height", line.height)
                    item.put("boundingBox", bounds)
                    items.put(item)
                }
                val response = JSObject()
                response.put("engine", "Google ML Kit")
                response.put("model", if (devanagari != null) "Latin + Devanagari bundled" else "Latin bundled")
                response.put("text", deduplicated.joinToString("\n") { it.text })
                response.put("items", items)
                response.put("width", bitmap.width)
                response.put("height", bitmap.height)
                call.resolve(response)
            } catch (error: Exception) {
                call.reject("Google ML Kit OCR failed: ${error.localizedMessage}", "MLKIT_FAILED")
            } finally {
                latin.close()
                devanagari?.close()
                if (!bitmap.isRecycled) bitmap.recycle()
            }
        }
    }

    private data class LineRecord(
        val text: String,
        val confidence: Float,
        val x: Double,
        val y: Double,
        val width: Double,
        val height: Double
    )
}
