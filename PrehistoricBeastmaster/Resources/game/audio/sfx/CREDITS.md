# 遊戲音效來源

作者：Kenney。授權：CC0 1.0。查核及下載日期：2026-09-08。

- New Platformer Pack 1.1：https://kenney.nl/assets/new-platformer-pack
- Interface Sounds 1.0：https://kenney.nl/assets/interface-sounds
- CC0：https://creativecommons.org/publicdomain/zero/1.0/

每個檔案的原始名稱與所屬素材包記錄於 manifest.json；兩個素材包的原始 License.txt 均隨附保存。
這些音效從官方下載包取出，以 Apple afconvert 轉為 16-bit PCM WAV；建置腳本統一峰值至約 -1.4 dBFS，並移除多餘容器資訊，使用標準 PCM 檔頭。未使用任何遊戲的未授權錄音。
播放時依場景調整音量與速度，設定同類音效冷卻與最多 6 聲並發；不改動背景音樂原檔。
瀏覽器使用 sfx-data.js 中的同一份 WAV 資料預先解碼，因此 file:// 預覽與離線 App 不需要請求外部音效服務。

## 素材包下載位置

- https://kenney.nl/media/pages/assets/new-platformer-pack/1896103897-1764756702/kenney_new-platformer-pack-1.1.zip
- https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip

來源與授權記錄不表示 Kenney 為本遊戲背書。CC0 不要求署名，此處自願保留來源方便交接。
