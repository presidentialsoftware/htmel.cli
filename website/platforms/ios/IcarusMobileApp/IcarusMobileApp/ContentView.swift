//
//  ContentView.swift
//  htmelMobileApp
//
//  Created by Ashton James Snow Morris Jefferson on 10/20/24.
//  Copyright © 2024 xtravanillasoftware. All rights reserved.
//

import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        WebView()
    }
}

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        
        // Locate the index.html file in the app bundle
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(url, allowingReadAccessTo: url)
        } else {
            print("Unable to find index.html.")
        }
        
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // You can add additional update logic if needed
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
