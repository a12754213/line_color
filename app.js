const STORAGE_URL_KEY = "chieny_supabase_url";
const STORAGE_ANON_KEY = "chieny_supabase_anon_key";
const COLORS_TABLE = "colors";
const IMAGE_BUCKET = "yarn-images";

let supabaseClient = null;
let colors = [];
let pendingPhotoFile = null;
let toastTimer = null;

window.addEventListener("DOMContentLoaded", async () => {
    bindUIHelpers();
    const configured = loadSavedConfigIntoForm();

    if (!configured) {
        setCloudStatus("尚未設定雲端", false);
        openConfigModal(true);
        return;
    }

    const connected = await initializeSupabaseFromSavedConfig();
    if (connected) {
        await loadColors();
    } else {
        openConfigModal(true);
    }
});

function bindUIHelpers() {
    document.getElementById("photoColorHex").addEventListener("input", (event) => {
        document.getElementById("photoHexText").textContent = event.target.value.toUpperCase();
    });
}

function getSavedConfig() {
    return {
        url: (localStorage.getItem(STORAGE_URL_KEY) || "").trim(),
        key: (localStorage.getItem(STORAGE_ANON_KEY) || "").trim()
    };
}

function loadSavedConfigIntoForm() {
    const { url, key } = getSavedConfig();
    document.getElementById("supabaseUrlInput").value = url;
    document.getElementById("supabaseKeyInput").value = key;
    updateConfigModalButtons(Boolean(url && key));
    return Boolean(url && key);
}

function createSupabaseClient(url, key) {
    if (!window.supabase || !window.supabase.createClient) {
        throw new Error("Supabase SDK 尚未載入，請確認網路連線後再試一次。");
    }
    return window.supabase.createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
}

async function initializeSupabaseFromSavedConfig() {
    const { url, key } = getSavedConfig();
    if (!url || !key) return false;

    try {
        supabaseClient = createSupabaseClient(url, key);
        const { error } = await supabaseClient.from(COLORS_TABLE).select("id").limit(1);
        if (error) throw error;
        setCloudStatus("已連線到她的 Supabase", true);
        return true;
    } catch (error) {
        console.error(error);
        supabaseClient = null;
        setCloudStatus("雲端連線失敗", false);
        showConfigMessage(formatSupabaseError(error), "error");
        return false;
    }
}

function openConfigModal(force = false) {
    loadSavedConfigIntoForm();
    const modal = document.getElementById("configModal");
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");

    const hasSavedConfig = Boolean(getSavedConfig().url && getSavedConfig().key);
    document.getElementById("configCloseButton").classList.toggle("hidden", force || !hasSavedConfig);
}

function closeConfigModal() {
    const { url, key } = getSavedConfig();
    if (!url || !key) {
        showConfigMessage("第一次使用需要先完成 Supabase 設定。", "error");
        return;
    }
    document.getElementById("configModal").classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
}

async function saveSupabaseConfig() {
    const url = document.getElementById("supabaseUrlInput").value.trim().replace(/\/+$/, "");
    const key = document.getElementById("supabaseKeyInput").value.trim();
    const button = document.getElementById("saveConfigButton");

    if (!/^https:\/\/.+\.supabase\.co$/i.test(url)) {
        showConfigMessage("Project URL 格式不正確，應該像 https://xxxx.supabase.co", "error");
        return;
    }
    if (!key) {
        showConfigMessage("請貼上 Anon / Publishable Key。", "error");
        return;
    }

    button.disabled = true;
    button.textContent = "正在測試連線...";
    showConfigMessage("正在確認資料表與權限...", "info");

    try {
        const testClient = createSupabaseClient(url, key);
        const { error } = await testClient.from(COLORS_TABLE).select("id").limit(1);
        if (error) throw error;

        localStorage.setItem(STORAGE_URL_KEY, url);
        localStorage.setItem(STORAGE_ANON_KEY, key);
        supabaseClient = testClient;

        updateConfigModalButtons(true);
        setCloudStatus("已連線到她的 Supabase", true);
        showConfigMessage("連線成功！設定已儲存在這台裝置。", "success");
        await loadColors();

        setTimeout(() => {
            document.getElementById("configModal").classList.add("hidden");
            document.body.classList.remove("overflow-hidden");
        }, 500);
    } catch (error) {
        console.error(error);
        supabaseClient = null;
        showConfigMessage(formatSupabaseError(error), "error");
        setCloudStatus("雲端連線失敗", false);
    } finally {
        button.disabled = false;
        button.textContent = "測試連線並儲存";
    }
}

function clearSupabaseConfig() {
    const ok = window.confirm("確定要清除這台裝置儲存的 Supabase 設定嗎？\n雲端資料不會被刪除，只會斷開這台裝置的連線。");
    if (!ok) return;

    localStorage.removeItem(STORAGE_URL_KEY);
    localStorage.removeItem(STORAGE_ANON_KEY);
    supabaseClient = null;
    colors = [];

    document.getElementById("supabaseUrlInput").value = "";
    document.getElementById("supabaseKeyInput").value = "";
    updateConfigModalButtons(false);
    setCloudStatus("尚未設定雲端", false);
    renderColors();
    showConfigMessage("已清除這台裝置的連線設定。", "info");
    document.getElementById("configCloseButton").classList.add("hidden");
}

function updateConfigModalButtons(hasSavedConfig) {
    document.getElementById("clearConfigButton").classList.toggle("hidden", !hasSavedConfig);
    document.getElementById("configCloseButton").classList.toggle("hidden", !hasSavedConfig);
}

function showConfigMessage(message, type = "info") {
    const element = document.getElementById("configMessage");
    const classes = {
        success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
        error: "bg-red-50 text-red-700 border border-red-200",
        info: "bg-stone-50 text-stone-600 border border-stone-200"
    };
    element.className = `text-xs rounded-lg px-3 py-2 ${classes[type] || classes.info}`;
    element.textContent = message;
    element.classList.remove("hidden");
}

function formatSupabaseError(error) {
    const message = error?.message || String(error || "未知錯誤");
    if (/relation .*colors.* does not exist/i.test(message) || /Could not find the table/i.test(message)) {
        return "已連到 Supabase，但找不到 colors 資料表。請先執行 supabase-setup.sql。";
    }
    if (/row-level security|permission denied|policy/i.test(message)) {
        return `已連到 Supabase，但權限尚未設定：${message}`;
    }
    if (/Failed to fetch|NetworkError/i.test(message)) {
        return "無法連線到 Supabase。請確認 Project URL、網路，以及 Key 是否正確。";
    }
    return `Supabase 回覆：${message}`;
}

function setCloudStatus(text, connected) {
    const element = document.getElementById("cloudStatus");
    element.textContent = connected ? `● ${text}` : `○ ${text}`;
    element.className = connected
        ? "text-[10px] text-emerald-700 font-medium"
        : "text-[10px] text-stone-400 font-medium";
}

async function ensureCloudReady() {
    if (supabaseClient) return true;
    const connected = await initializeSupabaseFromSavedConfig();
    if (!connected) {
        openConfigModal(true);
        showToast("請先完成 Supabase 雲端設定");
    }
    return connected;
}

async function loadColors() {
    if (!(await ensureCloudReady())) return;

    const list = document.getElementById("swatchList");
    list.innerHTML = '<p class="text-xs text-stone-400 w-full text-center py-8">正在同步雲端色票...</p>';

    const { data, error } = await supabaseClient
        .from(COLORS_TABLE)
        .select("id,name,hex,image_url,image_path,created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        list.innerHTML = `<p class="text-xs text-red-500 w-full text-center py-8">讀取失敗：${escapeHtml(error.message)}</p>`;
        return;
    }

    colors = (data || []).map(color => ({
        ...color,
        hex: normalizeHex(color.hex)
    }));
    renderColors();
}

function renderColors() {
    const list = document.getElementById("swatchList");
    const count = document.getElementById("colorCount");
    count.textContent = `${colors.length} 色`;

    updateMainColorSelect();

    if (!supabaseClient) {
        list.innerHTML = '<p class="text-xs text-stone-400 w-full text-center py-8">請先設定 Supabase 雲端空間</p>';
        return;
    }

    if (colors.length === 0) {
        list.innerHTML = '<p class="text-xs text-stone-400 w-full text-center py-8">還沒有色票，先新增第一個毛線色吧！</p>';
        return;
    }

    list.innerHTML = colors.map(color => `
        <article class="relative shrink-0 w-24 rounded-xl border border-stone-200 bg-stone-50 p-2 shadow-xs">
            <button onclick="deleteColor('${escapeJsString(color.id)}')" aria-label="刪除 ${escapeHtml(color.name)}" class="absolute z-10 -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-stone-200 text-stone-400 hover:text-red-600 text-[11px] shadow-sm">×</button>
            ${color.image_url
                ? `<div class="swatch-texture w-full h-14 rounded-lg border border-black/5 bg-cover bg-center" style="background-image:url('${escapeHtmlAttribute(color.image_url)}')"></div>`
                : `<div class="swatch-texture w-full h-14 rounded-lg border border-black/5" style="background-color:${color.hex}"></div>`
            }
            <p class="mt-2 text-[11px] font-medium text-stone-700 truncate" title="${escapeHtmlAttribute(color.name)}">${escapeHtml(color.name)}</p>
            <div class="flex items-center gap-1 mt-1">
                <span class="w-3 h-3 rounded-full border border-black/10 shrink-0" style="background:${color.hex}"></span>
                <span class="text-[9px] font-mono text-stone-400 truncate">${color.hex}</span>
            </div>
        </article>
    `).join("");
}

function updateMainColorSelect() {
    const select = document.getElementById("mainColorSelect");
    const current = select.value;
    select.innerHTML = '<option value="">請先選擇主色</option>' + colors.map(color =>
        `<option value="${escapeHtmlAttribute(String(color.id))}">${escapeHtml(color.name)} (${color.hex})</option>`
    ).join("");
    if (colors.some(color => String(color.id) === current)) select.value = current;
}

function toggleAddColorForm(force) {
    const form = document.getElementById("addColorForm");
    const shouldShow = typeof force === "boolean" ? force : form.classList.contains("hidden");
    form.classList.toggle("hidden", !shouldShow);
    if (shouldShow) document.getElementById("newColorName").focus();
}

async function saveNewColor(event) {
    event.preventDefault();
    if (!(await ensureCloudReady())) return;

    const name = document.getElementById("newColorName").value.trim();
    const hex = normalizeHex(document.getElementById("newColorHex").value);
    if (!name) return;

    const { error } = await supabaseClient.from(COLORS_TABLE).insert({ name, hex });
    if (error) {
        showToast(`儲存失敗：${error.message}`);
        return;
    }

    event.target.reset();
    document.getElementById("newColorHex").value = "#D4A373";
    toggleAddColorForm(false);
    showToast("色票已存到她自己的 Supabase ☁️");
    await loadColors();
}

async function deleteColor(id) {
    if (!(await ensureCloudReady())) return;
    const color = colors.find(item => String(item.id) === String(id));
    if (!color) return;

    const ok = window.confirm(`確定要刪除「${color.name}」嗎？`);
    if (!ok) return;

    if (color.image_path) {
        const { error: storageError } = await supabaseClient.storage.from(IMAGE_BUCKET).remove([color.image_path]);
        if (storageError) console.warn("Storage delete failed:", storageError);
    }

    const { error } = await supabaseClient.from(COLORS_TABLE).delete().eq("id", color.id);
    if (error) {
        showToast(`刪除失敗：${error.message}`);
        return;
    }
    showToast("色票已刪除");
    await loadColors();
}

async function handleImageUpload(event) {
    if (!(await ensureCloudReady())) {
        event.target.value = "";
        return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    pendingPhotoFile = file;
    try {
        const objectUrl = URL.createObjectURL(file);
        document.getElementById("photoPreview").src = objectUrl;
        const hex = await extractAverageColor(file);
        document.getElementById("photoColorHex").value = hex;
        document.getElementById("photoHexText").textContent = hex;
        document.getElementById("photoColorName").value = file.name.replace(/\.[^.]+$/, "");
        document.getElementById("photoModal").classList.remove("hidden");
        document.body.classList.add("overflow-hidden");
    } catch (error) {
        console.error(error);
        showToast("這張圖片無法讀取，請換 JPG / PNG / iPhone 可正常預覽的照片");
        pendingPhotoFile = null;
    } finally {
        event.target.value = "";
    }
}

function closePhotoModal() {
    document.getElementById("photoModal").classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    const preview = document.getElementById("photoPreview");
    if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
    preview.removeAttribute("src");
    pendingPhotoFile = null;
}

async function savePhotoColor() {
    if (!pendingPhotoFile || !(await ensureCloudReady())) return;

    const name = document.getElementById("photoColorName").value.trim();
    const hex = normalizeHex(document.getElementById("photoColorHex").value);
    const button = document.getElementById("savePhotoButton");
    if (!name) {
        showToast("請先輸入毛線名稱 / 色號");
        return;
    }

    button.disabled = true;
    button.textContent = "正在上傳...";

    const safeName = pendingPhotoFile.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const path = `${Date.now()}-${cryptoRandomString()}-${safeName}`;

    try {
        const { error: uploadError } = await supabaseClient.storage
            .from(IMAGE_BUCKET)
            .upload(path, pendingPhotoFile, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;

        const { data: publicData } = supabaseClient.storage.from(IMAGE_BUCKET).getPublicUrl(path);
        const imageUrl = publicData?.publicUrl || null;

        const { error: insertError } = await supabaseClient.from(COLORS_TABLE).insert({
            name,
            hex,
            image_url: imageUrl,
            image_path: path
        });
        if (insertError) {
            await supabaseClient.storage.from(IMAGE_BUCKET).remove([path]);
            throw insertError;
        }

        closePhotoModal();
        showToast("照片與色票已存到她自己的 Supabase ☁️");
        await loadColors();
    } catch (error) {
        console.error(error);
        showToast(`上傳失敗：${error.message || error}`);
    } finally {
        button.disabled = false;
        button.textContent = "上傳照片並儲存色票";
    }
}

function extractAverageColor(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const size = 80;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(image, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;

                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 16) {
                    const red = data[i];
                    const green = data[i + 1];
                    const blue = data[i + 2];
                    const alpha = data[i + 3];
                    if (alpha < 128) continue;
                    const brightness = (red + green + blue) / 3;
                    if (brightness < 18 || brightness > 245) continue;
                    r += red; g += green; b += blue; count++;
                }

                if (!count) throw new Error("沒有可用像素");
                resolve(rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count)));
            } catch (error) {
                reject(error);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("圖片解碼失敗"));
        };
        image.src = url;
    });
}

function generateManualPalette() {
    if (colors.length < 2) {
        showToast("至少需要 2 個色票才能配色");
        return;
    }

    const mainId = document.getElementById("mainColorSelect").value;
    const count = Math.min(Number(document.getElementById("colorCountSelect").value) || 2, colors.length);
    const theory = document.getElementById("theorySelect").value;
    const main = colors.find(color => String(color.id) === mainId);
    if (!main) {
        showToast("請先選一個主色");
        return;
    }

    const picked = buildTheoryPalette(main, count, theory);
    renderPaletteResult("manualResult", "manualResultPalette", picked);
}

function buildTheoryPalette(main, count, theory) {
    const mainHsl = hexToHsl(main.hex);
    const selected = [main];
    const candidates = colors.filter(color => color.id !== main.id);
    const targets = [];

    if (theory === "analogous") {
        [30, -30, 60, -60].slice(0, count - 1).forEach(offset => {
            targets.push({ h: wrapHue(mainHsl.h + offset), s: mainHsl.s, l: mainHsl.l });
        });
    } else if (theory === "complementary") {
        const offsets = count <= 2 ? [180] : [180, 160, 200, 30];
        offsets.slice(0, count - 1).forEach(offset => {
            targets.push({ h: wrapHue(mainHsl.h + offset), s: mainHsl.s, l: mainHsl.l });
        });
    } else if (theory === "triadic") {
        [120, 240, 90, 270].slice(0, count - 1).forEach(offset => {
            targets.push({ h: wrapHue(mainHsl.h + offset), s: mainHsl.s, l: mainHsl.l });
        });
    } else {
        const lightOffsets = [-20, 20, -35, 35];
        lightOffsets.slice(0, count - 1).forEach(offset => {
            targets.push({ h: mainHsl.h, s: mainHsl.s, l: clamp(mainHsl.l + offset, 5, 95) });
        });
    }

    for (const target of targets) {
        const available = candidates.filter(color => !selected.some(item => item.id === color.id));
        if (!available.length) break;
        available.sort((a, b) => hslDistance(hexToHsl(a.hex), target, theory) - hslDistance(hexToHsl(b.hex), target, theory));
        selected.push(available[0]);
    }

    if (selected.length < count) {
        const leftovers = candidates.filter(color => !selected.some(item => item.id === color.id));
        selected.push(...leftovers.slice(0, count - selected.length));
    }
    return selected;
}

function generateAutoPalette() {
    const requested = clamp(Number(document.getElementById("autoColorNum").value) || 3, 2, 5);
    const count = Math.min(requested, colors.length);
    if (colors.length < 2) {
        showToast("至少需要 2 個色票才能自動配色");
        return;
    }

    let best = null;
    for (const base of colors) {
        const analogous = buildTheoryPalette(base, count, "analogous");
        const complementary = buildTheoryPalette(base, count, "complementary");
        const triadic = buildTheoryPalette(base, count, "triadic");
        for (const palette of [analogous, complementary, triadic]) {
            const score = paletteHarmonyScore(palette);
            if (!best || score > best.score) best = { score, palette };
        }
    }

    renderPaletteResult("autoResult", "autoResultPalette", best?.palette || colors.slice(0, count));
}

function paletteHarmonyScore(palette) {
    if (palette.length < 2) return 0;
    const hsls = palette.map(color => hexToHsl(color.hex));
    let total = 0;
    let pairs = 0;

    for (let i = 0; i < hsls.length; i++) {
        for (let j = i + 1; j < hsls.length; j++) {
            const a = hsls[i], b = hsls[j];
            const hue = hueDistance(a.h, b.h);
            const sat = Math.abs(a.s - b.s);
            const light = Math.abs(a.l - b.l);

            const relation = Math.max(
                gaussian(hue, 30, 32),
                gaussian(hue, 120, 30),
                gaussian(hue, 180, 35)
            );
            const balance = 1 - Math.min(1, (sat * 0.35 + light * 0.65) / 100);
            total += relation * 0.75 + balance * 0.25;
            pairs++;
        }
    }
    return total / pairs;
}

function renderPaletteResult(containerId, paletteId, palette) {
    const container = document.getElementById(containerId);
    const target = document.getElementById(paletteId);
    target.innerHTML = palette.map(color => `
        <div class="shrink-0 w-20 text-center">
            <div class="swatch-texture w-20 h-16 rounded-xl border border-black/5 shadow-sm" style="background:${color.hex}"></div>
            <p class="mt-1 text-[10px] text-stone-600 truncate">${escapeHtml(color.name)}</p>
            <p class="text-[9px] font-mono text-stone-400">${color.hex}</p>
        </div>
    `).join("");
    container.classList.remove("hidden");
}

function hslDistance(a, b, theory) {
    const hueWeight = theory === "monochromatic" ? 3.2 : 1.5;
    const lightWeight = theory === "monochromatic" ? 1.0 : 0.5;
    return hueDistance(a.h, b.h) * hueWeight + Math.abs(a.s - b.s) * 0.35 + Math.abs(a.l - b.l) * lightWeight;
}

function hueDistance(a, b) {
    const diff = Math.abs(a - b) % 360;
    return Math.min(diff, 360 - diff);
}

function gaussian(value, center, spread) {
    const d = (value - center) / spread;
    return Math.exp(-0.5 * d * d);
}

function normalizeHex(hex) {
    const value = String(hex || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(value)) {
        return ("#" + [...value.slice(1)].map(c => c + c).join("")).toUpperCase();
    }
    return "#D4A373";
}

function hexToHsl(hex) {
    const normalized = normalizeHex(hex).slice(1);
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s: s * 100, l: l * 100 };
}

function rgbToHex(r, g, b) {
    const toHex = value => clamp(value, 0, 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function wrapHue(value) {
    return ((value % 360) + 360) % 360;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function cryptoRandomString() {
    if (window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(6);
        window.crypto.getRandomValues(bytes);
        return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }
    return Math.random().toString(36).slice(2, 10);
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeHtmlAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
}

function escapeJsString(value) {
    return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}
