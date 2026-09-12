#include <WiFi.h>
#include <WebServer.h>
#include <OneWire.h>          
#include <DallasTemperature.h> 
#include <WiFiManager.h> 
#include <ESPmDNS.h>

WebServer server(80);

// --- Turbidity Sensor Setup ---
int latestTurbidity = 0;
byte requestCmd[] = {0x18, 0x05, 0x00, 0x01, 0x0D};

// --- Temperature Sensor Setup ---
#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

void handleData() {
  tempSensor.requestTemperatures();
  float currentTemp = tempSensor.getTempCByIndex(0);

  String json = "{";
  json += "\"turbidity\":" + String(latestTurbidity) + ",";
  json += "\"temp\":" + String(currentTemp);              
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, 32, 33);
  tempSensor.begin();

  // --- WiFiManager ---
  WiFiManager wifiManager;
  Serial.println("Starting WiFiManager...");

  if (!wifiManager.autoConnect("PureFlow_Setup")) {
    Serial.println("Failed to connect to Wi-Fi. Restarting...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\nWiFi Connected!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  if (!MDNS.begin("pureflow")) {
    Serial.println("Error setting up MDNS responder!");
  } else {
    Serial.println("mDNS started! Dashboard can now use: http://pureflow.local");
  }

  server.on("/data", HTTP_GET, handleData);
  server.begin();
}

void loop() {
  server.handleClient();

  static unsigned long lastRequest = 0;
  if (millis() - lastRequest > 2000) {
    Serial2.write(requestCmd, 5);
    lastRequest = millis();
  }

  if (Serial2.available() >= 5) {
    byte buffer[5];
    Serial2.readBytes(buffer, 5);
    
    if (buffer[0] == 0x18 && buffer[1] == 0x05 && buffer[4] == 0x0D) {
      latestTurbidity = buffer[3];
      
      tempSensor.requestTemperatures();
      float printTemp = tempSensor.getTempCByIndex(0);

      Serial.print("Live Turbidity: ");
      Serial.print(latestTurbidity);
      Serial.print("  |  Live Temp: ");
      Serial.print(printTemp);
      Serial.println(" °C");
    }
  }
}