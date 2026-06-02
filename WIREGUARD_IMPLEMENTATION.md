# Wireguard VPN Implementation Plan (Debian 13)

## Tổng quan

Tích hợp Wireguard VPN để ESP32 kết nối MQTT broker an toàn qua internet mà **không cần mở port 1883 ra public**.

### Kiến trúc

```
ESP32 (anywhere, behind NAT)
    ↓ Wireguard tunnel (UDP 51820)
VPS Debian 13 — 10.0.0.1
   ├─ Wireguard interface wg0 (10.0.0.1/24)
   ├─ Node.js backend + Aedes MQTT broker (127.0.0.1:1883)
   └─ nftables chặn 1883 từ internet, chỉ cho wg0
```

### Lợi ích

- Broker bind `127.0.0.1:1883` (không expose internet)
- ESP32 có IP cố định trong VPN: `10.0.0.2`
- ESP32 di chuyển mạng (WiFi/4G) vẫn reconnect được
- Wireguard private key **được mã hóa bằng HMAC key đã burned eFuse** → lưu NVS plaintext nhưng an toàn
- End-to-end encryption (Wireguard protocol)

### Subnet & Ports

| Thành phần | Giá trị |
|---|---|
| VPS Wireguard IP | `10.0.0.1/24` |
| ESP32 Wireguard IP | `10.0.0.2/32` |
| Wireguard port | `51820/UDP` |
| MQTT broker | `127.0.0.1:1883/TCP` (loopback only) |
| Backend HTTP | chỉ qua reverse proxy (ngoài scope) |

---

## Part 1: VPS Debian 13 Setup

### 1.1 Cài đặt Wireguard

```bash
sudo apt update
sudo apt install -y wireguard wireguard-tools qrencode

# Verify
wg --version
```

### 1.2 Enable IP forwarding

```bash
# Backup
sudo cp /etc/sysctl.d/99-sysctl.conf /etc/sysctl.d/99-sysctl.conf.bak 2>/dev/null || true

# Tạo file riêng
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-wireguard.conf

# Apply
sudo sysctl --system

# Verify (kết quả phải = 1)
cat /proc/sys/net/ipv4/ip_forward
```

### 1.3 Generate server keypair

```bash
cd /etc/wireguard
umask 077

# Server keys
wg genkey | sudo tee server_private.key | sudo tee server_public.key.draft > /dev/null
sudo wg pubkey < server_private.key | sudo tee server_public.key

# Set permissions
sudo chmod 600 server_private.key
sudo chmod 644 server_public.key
sudo chown root:root /etc/wireguard/server_private.key

# Lưu lại public key (dùng cho ESP32 config)
sudo cat /etc/wireguard/server_public.key
```

**Lưu:** `server_private.key` (không share) và `server_public.key` (share cho client).

### 1.4 Generate ESP32 client keypair

```bash
cd /etc/wireguard
umask 077

wg genkey | sudo tee esp32_private.key > /dev/null
sudo wg pubkey < esp32_private.key | sudo tee esp32_public.key
sudo chmod 600 esp32_private.key
sudo chmod 644 esp32_public.key

# Lưu để flash vào ESP32
sudo cat /etc/wireguard/esp32_private.key
echo "---"
sudo cat /etc/wireguard/esp32_public.key
```

**Lưu:**
- `esp32_private.key` → mã hóa bằng HMAC key, flash qua serial (Part 2)
- `esp32_public.key` → điền vào `wg0.conf` dưới đây

### 1.5 Tự động detect interface name

Tên interface trên VPS generic KVM thường là `eth0`/`ens3`/`enp0s3`. Tránh hardcode:

```bash
# Xem default route interface
ip route | grep default
# Output ví dụ: default via 203.0.113.1 dev eth0 proto static
#                                                      ^^^^ đây là tên interface
```

Ghi nhớ tên này, dưới đây gọi là `<EXT_IF>` (thay bằng `eth0` hoặc giá trị thực tế).

### 1.6 Cấu hình Wireguard server

```bash
sudo nano /etc/wireguard/wg0.conf
```

Nội dung:

```ini
[Interface]
# Wireguard VPN subnet
Address = 10.0.0.1/24

# Listen port
ListenPort = 51820

# Server private key
PrivateKey = <NỘI_DUNG_CỦA_/etc/wireguard/server_private.key>

# MTU (tránh fragmentation khi encapsulate trong Wireguard)
MTU = 1420

# NAT và forward rules — interface tự detect qua $(ip route ...)
PostUp  = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o $(ip route | grep default | awk '{print $5}') -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o $(ip route | grep default | awk '{print $5}') -j MASQUERADE

[Peer]
# ESP32 client
PublicKey = <NỘI_DUNG_CỦA_/etc/wireguard/esp32_public.key>
AllowedIPs = 10.0.0.2/32
```

**Lưu ý:**
- `PostUp`/`PostDown` dùng `iptables` (legacy) vì `wg-quick` chưa support `nftables` natively. Trên Debian 13, `iptables` package vẫn còn và tương thích ngược với kernel netfilter.
- `%i` = interface name (`wg0`).

**Set permissions:**

```bash
sudo chmod 600 /etc/wireguard/wg0.conf
sudo chown root:root /etc/wireguard/wg0.conf
```

### 1.7 Cài iptables cho PostUp rules

```bash
sudo apt install -y iptables
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
```

### 1.8 Khởi động Wireguard

```bash
# Start
sudo systemctl enable --now wg-quick@wg0

# Verify
sudo wg show
# Expected:
#   interface: wg0
#   public key: <server_public>
#   private key: (hidden)
#   listening port: 51820
#   peer: <esp32_public>
#     allowed ips: 10.0.0.2/32

ip -br addr show wg0
# Expected: wg0   UP   10.0.0.1/24
```

### 1.9 Cấu hình nftables (Debian 13 default)

Backup rules hiện tại trước:

```bash
sudo cp /etc/nftables.conf /etc/nftables.conf.bak 2>/dev/null || true
```

Tạo file `/etc/nftables.d/wireguard.conf`:

```bash
sudo mkdir -p /etc/nftables.d
sudo nano /etc/nftables.d/wireguard.conf
```

```nft
#!/usr/sbin/nft -f

# Wireguard VPN rules
table inet wireguard {
    chain input {
        type filter hook input priority 0; policy accept;

        # Allow established/related
        ct state established,related accept

        # Allow loopback
        iif lo accept

        # Allow Wireguard
        udp dport 51820 accept

        # Block MQTT from internet — chỉ cho loopback
        # (loopback handled by iif lo rule above; drop mọi kết nối MQTT từ non-loopback)
        tcp dport 1883 ip saddr != 127.0.0.0/8 drop

        # Allow SSH (giữ rule sẵn có nếu có)
        tcp dport 22 accept
    }

    chain forward {
        type filter hook forward priority 0; policy drop;

        # Allow Wireguard → internet (cho ESP32 đi ra ngoài nếu cần update NTP, vv)
        iifname "wg0" oifname "eth0" accept
        iifname "eth0" oifname "wg0" ct state established,related accept
    }
}
```

**Lưu ý thay `eth0`** bằng `<EXT_IF>` thực tế của bạn.

Include file này vào `/etc/nftables.conf` chính:

```bash
sudo nano /etc/nftables.conf
```

Thêm trước dòng `flush table inet filter` (hoặc ở cuối file):

```nft
include "/etc/nftables.d/*.conf"
```

Apply:

```bash
sudo nft --check -f /etc/nftables.conf    # syntax check trước
sudo systemctl restart nftables
sudo systemctl status nftables

# Verify
sudo nft list ruleset | grep -A 20 wireguard
```

### 1.10 Verify firewall

```bash
# Wireguard port mở
sudo nft list ruleset | grep 51820
# Expected: udp dport 51820 accept

# MQTT port chỉ loopback
sudo nft list ruleset | grep 1883
# Expected: tcp dport 1883 ip saddr != 127.0.0.0/8 drop

# Test từ chính VPS — loopback vẫn được
ss -tlnp | grep 1883
# Expected: LISTEN 127.0.0.1:1883

# Test từ external (máy khác, KHÔNG phải VPS)
nmap <VPS_PUBLIC_IP> -p 1883
# Expected: closed
```

### 1.11 Update backend configuration

MQTT broker (Aedes) hiện tại bind `0.0.0.0:1883` hoặc qua config. Đổi về loopback:

**File `.env` của backend:**

```bash
# Tìm và sửa
MQTT_BIND_ADDRESS=127.0.0.1
MQTT_PORT=1883
```

Trong `src/config/aedes.js` đã có biến `MQTT_BIND_ADDRESS` → đã đúng.

**Restart backend:**

```bash
# Nếu dùng pm2
pm2 restart iot-attendance

# Nếu dùng systemd
sudo systemctl restart iot-attendance

# Nếu chạy thủ công
pkill -f "node server.js"
cd /opt/iot-attendance && nohup node server.js > /var/log/iot-attendance.log 2>&1 &
```

### 1.12 Verify MQTT bind

```bash
ss -tlnp | grep 1883
# Expected: LISTEN 127.0.0.1:1883

# Test subscribe nội bộ
mosquitto_sub -h 127.0.0.1 -p 1883 -t "test" -v
# Nếu nhận được message thì OK
```

---

## Part 2: ESP32 Firmware Changes

### 2.1 Thêm Wireguard library

`platformio.ini`:

```ini
lib_deps =
    lovyan03/LovyanGFX@^1.2.21
    adafruit/Adafruit PN532@^1.3.4
    me-no-dev/AsyncTCP
    marvinroger/AsyncMqttClient@^0.9.0
    bblanchon/ArduinoJson@^6.21.5
    hieromon/AutoConnect@^1.4.2
    https://github.com/trombik/WireGuard-ESP32-Arduino.git  # maintained fork
```

> Repo gốc `ciniml/WireGuard-ESP32-Arduino` không cập nhật từ 2022. `trombik/` là fork active hơn.

### 2.2 Tạo WG key wrapper class — dùng HMAC key mã hóa

ESP32 đã có HMAC key burned eFuse (từ flow provisioning hiện tại). Tận dụng key đó làm KEK (Key Encryption Key) để mã hóa Wireguard private key bằng **AES-256-GCM**.

**File: `src/security/WgKeyVault.h`**

```cpp
#pragma once
#include <Arduino.h>
#include <mbedtls/aes.h>
#include <mbedtls/gcm.h>

class WgKeyVault {
public:
    // Lưu WG private key đã mã hóa vào NVS
    // IV ngẫu nhiên 12 bytes || ciphertext || GCM tag 16 bytes
    // Base64 encode để lưu string
    static bool saveEncryptedPrivateKey(const char* wgPrivateKeyBase64);

    // Load + giải mã
    static bool loadDecryptedPrivateKey(char* out, size_t outLen);

    // Clear
    static bool clear();

private:
    static constexpr const char* NS = "wg_vault";
    static constexpr const char* KEY = "enc_priv";

    // Lấy 32-byte KEK từ HMAC signer (đã burned eFuse)
    static bool deriveKek(uint8_t kek[32]);

    // AES-256-GCM helpers
    static bool aesGcmEncrypt(
        const uint8_t key[32], const uint8_t* plain, size_t plainLen,
        uint8_t* iv, size_t ivLen,
        uint8_t* out, size_t* outLen);

    static bool aesGcmDecrypt(
        const uint8_t key[32], const uint8_t* iv, size_t ivLen,
        const uint8_t* cipher, size_t cipherLen,
        uint8_t* out, size_t* outLen);
};
```

**File: `src/security/WgKeyVault.cpp`**

```cpp
#include "WgKeyVault.h"
#include <Preferences.h>
#include "HmacSigner.h"  // existing — provides HMAC key from eFuse
#include <mbedtls/base64.h>
#include <esp_random.h>

// IV = 12 bytes
static constexpr size_t IV_LEN = 12;
// GCM tag = 16 bytes
static constexpr size_t TAG_LEN = 16;

bool WgKeyVault::deriveKek(uint8_t kek[32]) {
    // HmacSigner đã có key burned eFuse — dùng nó làm KEK
    // Thực tế: dùng key đó làm input cho một KDF đơn giản
    // Ở đây giả định HmacSigner::getKey() trả về 32 bytes
    return HmacSigner::getKey(kek, 32);
}

bool WgKeyVault::aesGcmEncrypt(
    const uint8_t key[32], const uint8_t* plain, size_t plainLen,
    uint8_t* iv, size_t ivLen,
    uint8_t* out, size_t* outLen) {

    mbedtls_gcm_context gcm;
    mbedtls_gcm_init(&gcm);

    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, 256);
    if (ret != 0) { mbedtls_gcm_free(&gcm); return false; }

    // Random IV
    esp_fill_random(iv, ivLen);

    ret = mbedtls_gcm_crypt_and_tag(
        &gcm, MBEDTLS_GCM_ENCRYPT, plainLen,
        iv, ivLen,
        nullptr, 0,  // AAD
        plain, out,
        TAG_LEN, out + plainLen  // tag appended
    );

    mbedtls_gcm_free(&gcm);
    if (ret != 0) return false;

    *outLen = plainLen + TAG_LEN;
    return true;
}

bool WgKeyVault::aesGcmDecrypt(
    const uint8_t key[32], const uint8_t* iv, size_t ivLen,
    const uint8_t* cipher, size_t cipherLen,
    uint8_t* out, size_t* outLen) {

    if (cipherLen < TAG_LEN) return false;

    mbedtls_gcm_context gcm;
    mbedtls_gcm_init(&gcm);

    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, 256);
    if (ret != 0) { mbedtls_gcm_free(&gcm); return false; }

    size_t dataLen = cipherLen - TAG_LEN;

    ret = mbedtls_gcm_auth_decrypt(
        &gcm, dataLen,
        iv, ivLen,
        nullptr, 0,
        cipher, dataLen,
        cipher + dataLen, TAG_LEN,
        out
    );

    mbedtls_gcm_free(&gcm);
    if (ret != 0) return false;

    *outLen = dataLen;
    return true;
}

bool WgKeyVault::saveEncryptedPrivateKey(const char* wgPrivateKeyBase64) {
    if (!wgPrivateKeyBase64 || strlen(wgPrivateKeyBase64) == 0) return false;

    uint8_t kek[32];
    if (!deriveKek(kek)) {
        Serial.println("[WG-VAULT] Failed to derive KEK");
        return false;
    }

    // WG key 32 bytes (base64 44 chars)
    uint8_t plain[32];
    size_t plainLen = 0;
    int ret = mbedtls_base64_decode(plain, sizeof(plain), &plainLen,
                                     (const uint8_t*)wgPrivateKeyBase64,
                                     strlen(wgPrivateKeyBase64));
    if (ret != 0 || plainLen != 32) {
        Serial.println("[WG-VAULT] Invalid WG key format");
        memset(plain, 0, sizeof(plain));
        return false;
    }

    // Encrypt: IV(12) || ciphertext(32) || tag(16) = 60 bytes
    uint8_t encrypted[60];
    uint8_t iv[IV_LEN];
    size_t encLen = 0;

    if (!aesGcmEncrypt(kek, plain, 32, iv, IV_LEN, encrypted, &encLen)) {
        Serial.println("[WG-VAULT] Encrypt failed");
        memset(plain, 0, sizeof(plain));
        memset(kek, 0, sizeof(kek));
        return false;
    }

    // Wipe
    memset(plain, 0, sizeof(plain));
    memset(kek, 0, sizeof(kek));

    // Build blob: IV(12) + encrypted(48) = 60 bytes
    uint8_t blob[60];
    memcpy(blob, iv, IV_LEN);
    memcpy(blob + IV_LEN, encrypted, encLen);

    // Base64 encode (60 bytes → ~80 chars)
    char b64[96] = {0};
    size_t b64Len = 0;
    mbedtls_base64_encode((uint8_t*)b64, sizeof(b64) - 1, &b64Len, blob, sizeof(blob));
    b64[b64Len] = '\0';

    // Save to NVS
    Preferences prefs;
    if (!prefs.begin(NS, false)) {
        Serial.println("[WG-VAULT] NVS open failed");
        return false;
    }
    prefs.putString(KEY, b64);
    prefs.end();

    Serial.printf("[WG-VAULT] Saved %u bytes encrypted WG key\n", b64Len);
    return true;
}

bool WgKeyVault::loadDecryptedPrivateKey(char* out, size_t outLen) {
    Preferences prefs;
    if (!prefs.begin(NS, true)) {
        Serial.println("[WG-VAULT] NVS read failed");
        return false;
    }
    String b64 = prefs.getString(KEY, "");
    prefs.end();

    if (b64.length() == 0) return false;

    // Decode base64
    uint8_t blob[80];
    size_t blobLen = 0;
    int ret = mbedtls_base64_decode(blob, sizeof(blob), &blobLen,
                                     (const uint8_t*)b64.c_str(), b64.length());
    if (ret != 0 || blobLen != 60) {
        Serial.println("[WG-VAULT] Bad stored format");
        return false;
    }

    uint8_t kek[32];
    if (!deriveKek(kek)) {
        Serial.println("[WG-VAULT] KEK derive failed");
        return false;
    }

    uint8_t plain[32];
    size_t plainLen = 0;
    if (!aesGcmDecrypt(kek, blob, IV_LEN, blob + IV_LEN, blobLen - IV_LEN,
                       plain, &plainLen) || plainLen != 32) {
        Serial.println("[WG-VAULT] Decrypt failed (key mismatch or corrupted)");
        memset(plain, 0, sizeof(plain));
        memset(kek, 0, sizeof(kek));
        return false;
    }

    memset(kek, 0, sizeof(kek));

    // Encode back to base64 cho Wireguard lib
    size_t outB64Len = 0;
    mbedtls_base64_encode((uint8_t*)out, outLen - 1, &outB64Len, plain, 32);
    out[outB64Len] = '\0';

    memset(plain, 0, sizeof(plain));
    return true;
}

bool WgKeyVault::clear() {
    Preferences prefs;
    prefs.begin(NS, false);
    prefs.clear();
    prefs.end();
    return true;
}
```

> **Yêu cầu:** `HmacSigner::getKey(uint8_t* out, size_t len)` phải tồn tại (export 32 bytes raw từ eFuse). Nếu hiện tại chỉ có `sign()`, thêm helper `getKey()` nội bộ.

### 2.3 Tạo WireguardManager class

**File: `src/network/WireguardManager.h`**

```cpp
#pragma once
#include <Arduino.h>
#include <Preferences.h>

class WireguardManager {
public:
    WireguardManager();
    bool begin();
    bool connect();
    bool isConnected() const;
    void disconnect();
    void tick();  // gọi trong loop() để auto-reconnect

    // Cấu hình
    bool saveConfig(const char* vpsIp, uint16_t vpsPort,
                    const char* privateKeyBase64,   // ← plaintext, sẽ được mã hóa
                    const char* publicKeyBase64);
    bool loadConfig();
    bool clearConfig();

    // Getters
    const char* getVpsIp() const { return _vpsIp; }
    uint16_t getVpsPort() const { return _vpsPort; }
    const char* getServerVpnIp() const { return "10.0.0.1"; }  // ← server IP, không phải local!
    const char* getLocalIp() const { return "10.0.0.2"; }      // ← IP của ESP32 trong VPN

private:
    Preferences _prefs;
    char _vpsIp[64];
    uint16_t _vpsPort;
    char _privateKey[45];  // base64
    char _publicKey[45];   // base64
    bool _connected;
    unsigned long _lastReconnectAttempt;

    static constexpr const char* NS = "wg_cfg";
    static constexpr const char* K_IP = "vps_ip";
    static constexpr const char* K_PORT = "vps_port";
    static constexpr const char* K_PUB = "pub_key";

    static constexpr unsigned long RECONNECT_INTERVAL_MS = 30000;
};
```

**File: `src/network/WireguardManager.cpp`**

```cpp
#include "WireguardManager.h"
#include <WireGuard-ESP32.h>
#include <WiFi.h>
#include "../security/WgKeyVault.h"

static WireGuard wg;

WireguardManager::WireguardManager()
    : _vpsPort(0), _connected(false), _lastReconnectAttempt(0) {
    memset(_vpsIp, 0, sizeof(_vpsIp));
    memset(_privateKey, 0, sizeof(_privateKey));
    memset(_publicKey, 0, sizeof(_publicKey));
}

bool WireguardManager::begin() {
    return loadConfig();
}

bool WireguardManager::connect() {
    if (_vpsIp[0] == '\0' || _vpsPort == 0 ||
        _privateKey[0] == '\0' || _publicKey[0] == '\0') {
        Serial.println("[WG] Not configured");
        return false;
    }

    Serial.printf("[WG] Connecting to %s:%d...\n", _vpsIp, _vpsPort);

    IPAddress localIP, serverIP;
    localIP.fromString(getLocalIp());    // 10.0.0.2
    serverIP.fromString(_vpsIp);

    bool ok = wg.begin(
        localIP,
        _privateKey,
        serverIP,
        _vpsPort,
        _publicKey
        // preshared key: optional, bỏ qua
    );

    if (ok) {
        _connected = true;
        Serial.printf("[WG] Connected, local IP: %s\n", getLocalIp());
    } else {
        _connected = false;
        Serial.println("[WG] Connection failed");
    }

    return ok;
}

bool WireguardManager::isConnected() const {
    return _connected;
}

void WireguardManager::disconnect() {
    wg.end();
    _connected = false;
    Serial.println("[WG] Disconnected");
}

void WireguardManager::tick() {
    if (!_connected && WiFi.status() == WL_CONNECTED) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
            _lastReconnectAttempt = now;
            Serial.println("[WG] Reconnecting...");
            connect();
        }
    }
}

bool WireguardManager::saveConfig(const char* vpsIp, uint16_t vpsPort,
                                   const char* privateKeyBase64,
                                   const char* publicKeyBase64) {
    // Validate
    if (strlen(vpsIp) == 0 || vpsPort == 0 ||
        strlen(privateKeyBase64) != 44 || strlen(publicKeyBase64) != 44) {
        Serial.println("[WG] Invalid config");
        return false;
    }

    // Lưu public key plaintext (không nhạy cảm)
    if (!_prefs.begin(NS, false)) {
        Serial.println("[WG] NVS write failed");
        return false;
    }
    _prefs.putString(K_IP, vpsIp);
    _prefs.putUShort(K_PORT, vpsPort);
    _prefs.putString(K_PUB, publicKeyBase64);
    _prefs.end();

    // Mã hóa private key bằng HMAC key
    if (!WgKeyVault::saveEncryptedPrivateKey(privateKeyBase64)) {
        Serial.println("[WG] Key encryption failed");
        return false;
    }

    Serial.printf("[WG] Saved config: %s:%d\n", vpsIp, vpsPort);
    return true;
}

bool WireguardManager::loadConfig() {
    if (!_prefs.begin(NS, true)) {
        Serial.println("[WG] NVS read failed");
        return false;
    }
    String vpsIp = _prefs.getString(K_IP, "");
    _vpsPort = _prefs.getUShort(K_PORT, 0);
    String publicKey = _prefs.getString(K_PUB, "");
    _prefs.end();

    if (vpsIp.length() == 0 || _vpsPort == 0 || publicKey.length() != 44) {
        Serial.println("[WG] Not configured");
        return false;
    }

    strncpy(_vpsIp, vpsIp.c_str(), sizeof(_vpsIp) - 1);
    strncpy(_publicKey, publicKey.c_str(), sizeof(_publicKey) - 1);

    // Load + giải mã private key
    if (!WgKeyVault::loadDecryptedPrivateKey(_privateKey, sizeof(_privateKey))) {
        Serial.println("[WG] Failed to decrypt private key");
        return false;
    }

    Serial.printf("[WG] Loaded config: %s:%d\n", _vpsIp, _vpsPort);
    return true;
}

bool WireguardManager::clearConfig() {
    _prefs.begin(NS, false);
    _prefs.clear();
    _prefs.end();
    WgKeyVault::clear();

    memset(_vpsIp, 0, sizeof(_vpsIp));
    memset(_privateKey, 0, sizeof(_privateKey));
    memset(_publicKey, 0, sizeof(_publicKey));
    _vpsPort = 0;
    _connected = false;

    Serial.println("[WG] Config cleared");
    return true;
}
```

### 2.4 Update ServerClient.cpp — dùng SERVER VPN IP

**QUAN TRỌNG:** Sửa bug trong plan cũ — ESP32 phải kết nối MQTT tới `10.0.0.1` (VPS VPN IP), không phải `10.0.0.2` (chính ESP32).

Trong `ServerClient.h`, thêm extern:

```cpp
class WireguardManager;  // forward decl
extern WireguardManager wireguardManager;
```

Trong `ServerClient.cpp`:

```cpp
#include "WireguardManager.h"

void ServerClient::beginMqtt() {
    loadServerConfig();

    // Nếu Wireguard connected, dùng IP server VPN (10.0.0.1), KHÔNG phải local IP
    if (wireguardManager.isConnected()) {
        Serial.println("[Server] Using Wireguard VPN for MQTT");
        strncpy(_serverUrl, wireguardManager.getServerVpnIp(), sizeof(_serverUrl) - 1);
        _serverPort = 1883;
    }

    if (_serverUrl[0] == '\0' || _serverPort == 0) {
        Serial.println("[Server] Broker not configured");
        return;
    }

    String deviceId = "ESP32_" + WiFi.macAddress();
    deviceId.replace(":", "");
    mqttClient.begin(_serverUrl, _serverPort, deviceId.c_str());
}
```

### 2.5 Update main.cpp

```cpp
#include "display/DisplayManager.h"
#include "network/ServerClient.h"
#include "network/WireguardManager.h"
#include "nfc/CardManager.h"
#include "nfc/PN532Manager.h"
#include "security/HmacSigner.h"
#include "security/AesGcmCipher.h"
#include "security/ProvisionManager.h"
#include "core/DeviceStateMachine.h"
#include <Arduino.h>
#include <esp_system.h>

DisplayManager displayManager;
PN532Manager pn532;
CardManager cardManager(pn532);
ServerClient serverClient;
ProvisionManager provision;
WireguardManager wireguardManager;  // ← global, extern được

DeviceStateMachine *sm = nullptr;

// ... existing handlers ...

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println(F("[MAIN] NFC Attendance v4 Wireguard"));

    displayManager.init();
    provision.begin();
    cardManager.begin();

    if (provision.isProvisioned()) {
        HmacSigner::begin();
        AesGcmCipher::begin();
    } else if (provision.isReadyToBurn()) {
        Serial.println(F("[MAIN] Send PROVISION to burn eFuse key"));
    } else {
        displayManager.showError("Key Error!\nCheck serial");
    }

    if (!pn532.init()) {
        displayManager.showError("NFC Fail!");
    }

    AutoConnectManager &wifi = serverClient.getWiFiManager();
    serverClient.setupAutoConnectPages(wifi.getPortal());

    displayManager.showProcessing("Connecting WiFi...");

    if (wifi.begin("ESP32-Attendance")) {
        String ipStr = "IP: " + wifi.getIP();
        displayManager.showProcessing(ipStr.c_str());
        delay(2000);
    } else {
        displayManager.showProcessing("Connect WiFi:\nESP32-Attendance");
    }

    // Wireguard — load config + connect
    if (wireguardManager.begin()) {
        displayManager.showProcessing("Connecting VPN...");
        if (wireguardManager.connect()) {
            displayManager.showProcessing("VPN OK");
            delay(1000);
        } else {
            displayManager.showProcessing("VPN Failed");
            delay(2000);
        }
    } else {
        Serial.println("[MAIN] Wireguard not configured");
    }

    serverClient.beginMqtt();
    serverClient.setMqttResultCallback(handleMqttResult);

    sm = new DeviceStateMachine(wifi, serverClient, cardManager, displayManager, provision);
    sm->begin();
}

void loop() {
    // Handle serial commands
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();

        if (cmd == "PROVISION") {
            doProvision();
        } else if (cmd == "STATUS") {
            provision.printStatus();
            Serial.printf("[MAIN] HMAC ready: %s\n", HmacSigner::isReady() ? "yes" : "no");
            Serial.printf("[MAIN] WG VPN: %s\n", wireguardManager.isConnected() ? "yes" : "no");
        } else if (cmd == "WG_STATUS") {
            Serial.printf("[WG] Connected: %s\n", wireguardManager.isConnected() ? "yes" : "no");
            Serial.printf("[WG] VPS: %s:%d\n", wireguardManager.getVpsIp(), wireguardManager.getVpsPort());
            Serial.printf("[WG] Local VPN IP: %s\n", wireguardManager.getLocalIp());
            Serial.printf("[WG] Server VPN IP: %s\n", wireguardManager.getServerVpnIp());
        } else if (cmd == "WG_CLEAR") {
            wireguardManager.clearConfig();
            Serial.println("[WG] Cleared, rebooting...");
            ESP.restart();
        } else if (cmd.startsWith("WG_CONFIG ")) {
            // Format: WG_CONFIG <vps_ip> <vps_port> <esp32_private_key> <server_public_key>
            // Tách bằng space, không có preshared key
            int p1 = cmd.indexOf(' ', 10);
            int p2 = cmd.indexOf(' ', p1 + 1);
            int p3 = cmd.indexOf(' ', p2 + 1);

            if (p1 < 0 || p2 < 0 || p3 < 0) {
                Serial.println("[WG] Usage: WG_CONFIG <vps_ip> <port> <esp32_priv> <server_pub>");
            } else {
                String vpsIp = cmd.substring(10, p1);
                uint16_t port = cmd.substring(p1 + 1, p2).toInt();
                String priv = cmd.substring(p2 + 1, p3);
                String pub = cmd.substring(p3 + 1);
                pub.trim();

                if (wireguardManager.saveConfig(vpsIp.c_str(), port,
                                                priv.c_str(), pub.c_str())) {
                    Serial.println("[WG] Saved, rebooting...");
                    delay(1000);
                    ESP.restart();
                }
            }
        } else if (cmd == "RESET") {
            ESP.restart();
        } else {
            Serial.println("[MAIN] Commands: PROVISION, STATUS, WG_STATUS, WG_CONFIG, WG_CLEAR, RESET");
        }
        Serial.flush();
    }

    if (sm) sm->tick();
    wireguardManager.tick();  // ← auto-reconnect

    delay(10);
}
```

### 2.6 Flash ESP32

```bash
cd D:\PJ\musicplayer

# Compile
pio run -e esp32-s3-devkitc-1

# Flash
pio run -e esp32-s3-devkitc-1 -t upload

# Monitor
pio device monitor -b 115200
```

### 2.7 Cấu hình Wireguard qua Serial

Sau khi flash, kết nối serial monitor, gửi:

```
WG_CONFIG <VPS_PUBLIC_IP> 51820 <esp32_private_key> <server_public_key>
```

Ví dụ:

```
WG_CONFIG 203.0.113.10 51820 aGVsbG93b3JsZGZvb2JhcmJhemxvbmdrZXk= k0nb2OQ5e3p8Lh3y4z5A6B7C8D9E0F1G2H3I4J5K6L7M=
```

ESP32 sẽ tự:
1. Validate format
2. Mã hóa private key bằng HMAC key eFuse
3. Lưu vào NVS (ciphertext + public key plaintext)
4. Reboot

---

## Part 3: Testing

### 3.1 VPS — Verify trước khi test ESP32

```bash
# Wireguard interface
ip -br addr show wg0
# Expected: wg0 UP 10.0.0.1/24

# Wireguard peers (chưa có ESP32 connect = empty)
sudo wg show
# Expected: interface line có, peer line chưa có

# MQTT chỉ loopback
ss -tlnp | grep 1883
# Expected: LISTEN 127.0.0.1:1883

# nftables rules
sudo nft list ruleset | grep -E "(51820|1883)"
# Expected:
#   udp dport 51820 accept
#   tcp dport 1883 ip saddr != 127.0.0.0/8 drop

# Forwarding
cat /proc/sys/net/ipv4/ip_forward
# Expected: 1

# External scan
nmap <VPS_PUBLIC_IP> -p 1883
# Expected: closed
nmap <VPS_PUBLIC_IP> -p 51820 -sU
# Expected: open|filtered
```

### 3.2 ESP32 — Verify boot sequence

Mở serial monitor, quan sát:

```
[MAIN] NFC Attendance v4 Wireguard
[PROV] OK
[Server] Connecting WiFi...
IP: 192.168.1.100
[WG] Loaded config: 203.0.113.10:51820
[WG] Connecting to 203.0.113.10:51820...
[WG] Connected, local IP: 10.0.0.2
[Server] Using Wireguard VPN for MQTT
[Server] Loaded broker: 10.0.0.1:1883   ← ĐÚNG IP server
[MQTT] Connecting to 10.0.0.1:1883...
[MQTT] Connected
```

> Nếu thấy `[Server] Loaded broker: 10.0.0.2:1883` → **BUG**, sửa lại code.

### 3.3 VPS — Verify peer handshake

```bash
# ESP32 đã connect Wireguard
sudo wg show
# Expected:
#   peer: <esp32_public>
#     endpoint: <ESP32_PUBLIC_IP>:<random>
#     allowed ips: 10.0.0.2/32
#     latest handshake: <recent>
#     transfer: <rx/tx bytes>

# Ping ESP32 từ VPS
ping -c 3 10.0.0.2
# Expected: 64 bytes from 10.0.0.2
```

### 3.4 End-to-end MQTT test

```bash
# VPS — subscribe
mosquitto_sub -h 127.0.0.1 -p 1883 -t "attendance/#" -v

# ESP32 — quét thẻ NFC, sẽ publish lên topic
# Output trên VPS:
#   attendance/scan {"device_id":"ESP32_...","card_uid":"..."}
```

### 3.5 External — Verify MQTT không accessible

```bash
# Từ máy khác (KHÔNG qua Wireguard)
mosquitto_sub -h <VPS_PUBLIC_IP> -p 1883 -t "test" -v
# Expected: Connection refused

nmap <VPS_PUBLIC_IP> -p 1883
# Expected: closed
```

### 3.6 Network change test

```bash
# 1. ESP32 connect WiFi gia đình
# 2. Đổi sang mobile hotspot
# 3. Quan sát serial:
[WiFi] Disconnected
[WiFi] Connecting to new network...
[WiFi] Connected, IP: 192.168.43.100
[WG] Reconnecting...
[WG] Connected, local IP: 10.0.0.2
[MQTT] Reconnecting...
[MQTT] Connected
```

---

## Part 4: Rollback

### 4.1 VPS

```bash
# Stop Wireguard
sudo systemctl disable --now wg-quick@wg0

# Xóa nftables rules
sudo rm /etc/nftables.d/wireguard.conf
sudo nft delete table inet wireguard 2>/dev/null
sudo systemctl reload nftables

# Update backend .env
sed -i 's/MQTT_BIND_ADDRESS=127.0.0.1/MQTT_BIND_ADDRESS=0.0.0.0/' /opt/iot-attendance/.env
pm2 restart iot-attendance
```

### 4.2 ESP32

Gửi `WG_CLEAR` qua serial → xóa config → reboot → ESP32 dùng lại broker URL cũ từ NVS.

Hoặc reflash firmware cũ (không có Wireguard code).

---

## Part 5: Security Notes

### 5.1 Key storage

| Key | Lưu ở đâu | Encrypted? | Note |
|---|---|---|---|
| Server private | `/etc/wireguard/server_private.key` | mode 600 | Backup ở password manager |
| Server public | `/etc/wireguard/server_public.key` | mode 644 | OK public |
| ESP32 public (NVS) | Plaintext NVS | Không (không nhạy cảm) | OK public |
| **ESP32 private (NVS)** | **Plaintext NVS** | **Mã hóa AES-256-GCM bằng HMAC key eFuse** | Decrypt khi cần, wipe sau dùng |
| HMAC key (eFuse) | ESP32 efuse BLOCK0 | Hardware fuse | Không đọc được từ software |

**Khi NSP bị dump bằng `esptool.py`**, attacker thấy ciphertext + IV. Để decrypt cần HMAC key từ eFuse — không thể đọc từ software sau khi burned.

### 5.2 Backup keys

```bash
# Tạo archive encrypted
sudo tar czf - -C /etc wireguard/ | gpg -c > wireguard-keys-$(date +%F).tar.gz.gpg

# Lưu ở Bitwarden/1Password, KHÔNG lưu cùng VPS
```

### 5.3 Key rotation

Nếu key bị lộ:

```bash
# 1. Generate new server key
cd /etc/wireguard
umask 077
wg genkey | sudo tee server_private.key.new | sudo wg pubkey > server_public.key.new

# 2. Generate new ESP32 key
wg genkey | sudo tee esp32_private.key.new | sudo wg pubkey > esp32_public.key.new

# 3. Update wg0.conf với public key mới
sudo nano /etc/wireguard/wg0.conf
# Sửa PrivateKey = <server_private.key.new>
# Sửa [Peer] PublicKey = <esp32_public.key.new>

# 4. Apply
sudo systemctl restart wg-quick@wg0

# 5. Flash ESP32 với private key mới (qua WG_CONFIG)
# 6. Verify handshake
sudo wg show
```

---

## Part 6: Troubleshooting

### 6.1 ESP32 không connect Wireguard

**Symptom:** `[WG] Connection failed`

**Check:**

```bash
# 1. VPS có listen 51820 không?
sudo ss -ulnp | grep 51820

# 2. nftables có allow không?
sudo nft list ruleset | grep 51820

# 3. ESP32 gửi packet đến VPS không?
sudo tcpdump -i eth0 -n udp port 51820
```

**Common causes:**
- VPS provider block UDP → liên hệ support
- VPS behind NAT (LXC/OpenVZ) → cần IP public trực tiếp
- Key bị newline ở cuối khi paste → re-paste clean

### 6.2 Wireguard connected, MQTT fail

**Symptom:** `[WG] Connected` nhưng `[MQTT] Disconnected`

```bash
# 1. Verify broker listen loopback
ss -tlnp | grep 1883

# 2. Ping từ VPS đến ESP32
ping 10.0.0.2

# 3. Ping ngược (từ ESP32 — debug qua serial)
# Thêm code test:
#   IPAddress vpsVpn(10, 0, 0, 1);
#   Serial.printf("VPS reach: %d\n", WiFi.RSSI());

# 4. Check forward rules
sudo nft list ruleset | grep -A 5 forward
# Phải có rule cho wg0

# 5. Test từ VPS loopback
mosquitto_pub -h 127.0.0.1 -p 1883 -t test -m "hello"
mosquitto_sub -h 127.0.0.1 -p 1883 -t test -v
```

### 6.3 Key decrypt fail

**Symptom:** `[WG] Failed to decrypt private key`

**Cause:** HMAC key eFuse bị re-burned (eFuse one-time write) hoặc HMAC key từ ESP32 mới khác ESP32 cũ.

**Fix:** Re-flash ESP32 với `WG_CONFIG` mới + đảm bảo cùng thiết bị dùng HMAC key burned ban đầu.

### 6.4 Out of memory

**Symptom:** Crash khi Wireguard connect.

**Fix:**
```cpp
Serial.printf("[MEM] Free heap: %u\n", ESP.getFreeHeap());
// Expected: > 50000 sau Wireguard connect
```

Nếu thiếu:
- Disable Bluetooth (đã làm mặc định)
- Giảm MQTT buffer size trong `AsyncMqttClient`
- Dùng board có PSRAM (ESP32-S3 thường có)

---

## Part 7: Maintenance

### 7.1 Thêm ESP32 thứ 2

```bash
# 1. Generate keypair mới
cd /etc/wireguard
umask 077
wg genkey | sudo tee esp32_2_private.key > /dev/null
sudo wg pubkey < esp32_2_private.key | sudo tee esp32_2_public.key

# 2. Thêm peer
sudo nano /etc/wireguard/wg0.conf
```

```ini
[Peer]
PublicKey = <esp32_2_public>
AllowedIPs = 10.0.0.3/32
```

```bash
# 3. Apply (không cần restart service, dùng wg set)
sudo wg addconf wg0 <(wg-quick strip wg0)
# hoặc
sudo systemctl reload wg-quick@wg0

# 4. Verify
sudo wg show
```

### 7.2 Wireguard API endpoint (optional)

`src/routes/wireguard.js`:

```javascript
const express = require('express');
const { exec } = require('child_process');
const router = express.Router();

router.get('/status', (req, res) => {
    exec('sudo wg show wg0', { timeout: 5000 }, (err, stdout) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'ok', raw: stdout });
    });
});

module.exports = router;
```

> Cần sudoers entry cho `wg` command, không nên expose public.

### 7.3 Monitoring script

`/usr/local/bin/wg-monitor.sh`:

```bash
#!/bin/bash
HANDSHAKE=$(sudo wg show wg0 latest-handshakes | awk '{print $2}')
NOW=$(date +%s)
LIMIT=180  # 3 phút

for ts in $HANDSHAKE; do
    if [ -n "$ts" ] && [ "$ts" != "0" ]; then
        AGE=$((NOW - ts))
        if [ $AGE -gt $LIMIT ]; then
            echo "WARN: peer stale $AGE seconds"
            exit 1
        fi
    fi
done
echo "OK"
```

Chạy qua cron mỗi 5 phút, alert nếu fail.

---

## Summary Checklist

### VPS
- [ ] Install `wireguard`, `wireguard-tools`, `iptables`
- [ ] IP forwarding enabled
- [ ] Server keypair generated (mode 600)
- [ ] ESP32 client keypair generated
- [ ] `wg0.conf` configured với PostUp dùng detected interface
- [ ] Service enabled, `wg show` hiển thị peer config
- [ ] nftables: allow 51820/UDP, block 1883 non-loopback
- [ ] Backend `MQTT_BIND_ADDRESS=127.0.0.1`
- [ ] External scan: 1883 closed, 51820 open

### ESP32
- [ ] Wireguard lib added (trombik fork)
- [ ] `WgKeyVault.h/.cpp` với AES-256-GCM
- [ ] `WireguardManager.h/.cpp`
- [ ] `ServerClient.cpp` dùng `getServerVpnIp()` = `10.0.0.1`
- [ ] `main.cpp` gọi `wireguardManager.tick()` trong loop
- [ ] Compile + flash thành công
- [ ] `WG_CONFIG` set vps_ip, port, priv, pub
- [ ] Serial log: `[WG] Connected, local IP: 10.0.0.2`
- [ ] Serial log: `[Server] Loaded broker: 10.0.0.1:1883`
- [ ] MQTT publish/subscribe thành công

### Testing
- [ ] VPS: `ping 10.0.0.2` từ VPS
- [ ] VPS: `wg show` thấy peer handshake
- [ ] VPS: `mosquitto_sub` nhận message từ ESP32
- [ ] External: `nmap <vps_ip> -p 1883` = closed
- [ ] Network change: ESP32 reconnect VPN + MQTT

### Security
- [ ] Server private key mode 600
- [ ] ESP32 private key mã hóa bằng HMAC key eFuse
- [ ] Keys backup ở password manager
- [ ] nftables verified
- [ ] Rollback plan documented

---

## Estimated Time

| Phase | Time |
|---|---|
| VPS setup | 30-45 phút |
| ESP32 firmware | 2-3 giờ |
| Testing | 1-2 giờ |
| **Total** | **4-6 giờ** |

---

## References

- Wireguard: https://www.wireguard.com/
- WireGuard-ESP32-Arduino (fork): https://github.com/trombik/WireGuard-ESP32-Arduino
- nftables wiki: https://wiki.nftables.org/
- mbedTLS AES-GCM: https://docs.mbed.com/docs/mbedtls-handbook/en/latest/kb/cryptography/aes-gcm/
- Debian Wireguard: https://wiki.debian.org/WireGuard
