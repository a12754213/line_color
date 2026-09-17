# ChienY. Workshop 鉤織配色 PWA

這一版已經按照「GitHub 公開，但實際資料放在女朋友自己的 Supabase」重做完成。

## 架構

```text
公開 GitHub / GitHub Pages
├─ index.html
├─ app.js
├─ PWA 檔案
└─ 完全沒有寫死她的 Supabase URL / Key

女朋友第一次開 App
        ↓
輸入她自己的 Project URL + Anon / Publishable Key
        ↓
只存進她那台裝置的 localStorage
        ↓
色票資料 → 她自己的 Supabase Database
照片     → 她自己的 Supabase Storage
```

## 第 1 步：她建立自己的 Supabase

1. 到 Supabase 建立 Free Project。
2. 打開 **SQL Editor**。
3. 建立 New query。
4. 把本資料夾的 `supabase-setup.sql` 全部貼上並執行一次。
5. 到 Project Settings / API 相關頁面取得：
   - Project URL
   - Anon / Publishable Key

**不要使用 Service Role / Secret Key。**

## 第 2 步：把這個資料夾放到 GitHub

整個資料夾可直接放進公開 Repository：

```text
index.html
app.js
manifest.webmanifest
pwa-register.js
sw.js
offline.html
supabase-setup.sql
icons/
```

`index.html` 和 `app.js` 裡沒有她的 Supabase URL / Key。

## 第 3 步：開 GitHub Pages

Repository → **Settings → Pages**：

- Source：Deploy from a branch
- Branch：`main`
- Folder：`/ (root)`

儲存後使用 GitHub Pages 提供的 HTTPS 網址。

## 第 4 步：她第一次開啟

第一次進入網站會自動跳出「設定自己的 Supabase」。

她輸入自己的：

- Project URL
- Anon / Publishable Key

按「測試連線並儲存」。

設定只會存在該瀏覽器 / 該裝置的 `localStorage`。

如果她清除 Safari 網站資料、換手機或換瀏覽器，需要重新輸入一次。

## 第 5 步：iPhone 安裝成 App

1. 用 Safari 開 GitHub Pages 網址。
2. 點 Safari「分享」。
3. 選「加入主畫面」。
4. 之後可直接從 iPhone 主畫面開啟。

## 已完成的功能

- PWA manifest / Service Worker / App Icon
- iPhone 主畫面 standalone 模式
- 第一次啟動 Supabase 設定
- URL / Key 只存在使用者自己的裝置
- 測試 Supabase 連線
- 雲端色票讀取 / 新增 / 刪除
- 毛線照片上傳到她自己的 Storage
- 從照片粗略估算主色，仍可手動修改
- 手動配色理論
- 自動配色推薦
- 離線頁面

## 安全性要知道的一件事

這個專案是你指定的「只有她一個人用、不要登入」版本，因此 RLS 對 `anon` 角色開放色票與指定圖片 Bucket 的讀寫。

這代表：

- GitHub 公開本身不會暴露她的設定，因為 URL / Key 沒寫在程式碼中。
- 但如果別人另外取得她的 Project URL + Anon / Publishable Key，就會有相同的色票讀寫權限。

如果未來要正式給多人使用，應再加 Supabase Auth，並把 RLS 改成依 `auth.uid()` 隔離資料。
