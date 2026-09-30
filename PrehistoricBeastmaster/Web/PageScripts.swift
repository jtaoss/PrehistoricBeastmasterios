import Foundation

enum PageScripts {
    static let networkRestored = """
    (function(){try{window.dispatchEvent(new Event('online'));}catch(error){}})();
    """

    static func sdkStatus(_ json: String) -> String {
        "window.__shellSdkStatus=\(jsString(json));"
    }

    static func javaCallBack(_ json: String) -> String {
        """
        (function(){
            var data = \(json);
            try { if (typeof window.javaCallBack === 'function') { window.javaCallBack(data); } } catch(e){}
            try { if (window.xmwsdk && typeof window.xmwsdk.paycallback === 'function') { window.xmwsdk.paycallback(data); } } catch(e){}
            try { window.dispatchEvent(new CustomEvent('pbm-pay-result', { detail: data })); } catch(e){}
        })();
        """
    }

    static func economyResult(_ json: String) -> String {
        "window.onNativeEconomyResult&&window.onNativeEconomyResult(\(json));"
    }

    static func economyState(_ json: String) -> String {
        "window.__pbmEconomy=\(json);window.dispatchEvent(new CustomEvent('pbm-economy-change',{detail:window.__pbmEconomy}));"
    }

    static func shellActive(_ active: Bool) -> String {
        "window.dispatchEvent(new CustomEvent('emberwild-shell-active',{detail:{active:\(active)}}));"
    }

    /// Pause the bundled game loop and suspend WebAudio before a remote module covers it.
    static let shellSuspend = """
    (function(){
      try { window.dispatchEvent(new CustomEvent('emberwild-shell-active',{detail:{active:false}})); } catch (error) {}
      var nodes = document.querySelectorAll('audio,video');
      for (var i = 0; i < nodes.length; i++) { try { nodes[i].pause(); } catch (error) {} }
      var contexts = [];
      if (window.__pbmFallbackAudio) contexts.push(window.__pbmFallbackAudio);
      if (window.__pbmAudioContexts && window.__pbmAudioContexts.length) contexts = contexts.concat(window.__pbmAudioContexts);
      for (var j = 0; j < contexts.length; j++) { try { contexts[j].suspend && contexts[j].suspend(); } catch (error) {} }
    })();
    """

    /// Wake the bundled game after the remote module has released its web view.
    static let shellResume = """
    (function(){
      try { window.dispatchEvent(new CustomEvent('emberwild-shell-resume',{detail:{active:true}})); } catch (error) {}
      try { window.dispatchEvent(new CustomEvent('emberwild-shell-active',{detail:{active:true}})); } catch (error) {}
      var contexts = [];
      if (window.__pbmFallbackAudio) contexts.push(window.__pbmFallbackAudio);
      if (window.__pbmAudioContexts && window.__pbmAudioContexts.length) contexts = contexts.concat(window.__pbmAudioContexts);
      for (var i = 0; i < contexts.length; i++) { try { contexts[i].resume && contexts[i].resume(); } catch (error) {} }
    })();
    """

    static func jsString(_ value: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [value])
        let encoded = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        if encoded.count >= 2 {
            let start = encoded.index(after: encoded.startIndex)
            let end = encoded.index(before: encoded.endIndex)
            return String(encoded[start..<end])
        }
        return "\"\""
    }
}
