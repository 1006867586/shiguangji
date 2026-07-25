from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})

    # 捕获控制台错误
    errors = []
    page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))

    page.goto("http://localhost:3000/", wait_until="networkidle", timeout=30000)
    # 给 MapLibre 一点时间渲染瓦片和图层
    page.wait_for_timeout(3000)

    page.screenshot(path="/workspace/wuhan-1-initial.png", full_page=False)
    print("截图1（初始）已保存")

    # 看看地图容器是否存在
    map_canvas = page.locator(".maplibregl-canvas")
    print(f"地图画布数量: {map_canvas.count()}")

    # 看看标题
    title = page.locator("h1").first
    print(f"标题: {title.inner_text() if title.count() else 'N/A'}")

    # 点击地图中央偏左（武昌区大致位置），用画布坐标
    box = map_canvas.bounding_box()
    if box:
        cx = box["x"] + box["width"] * 0.5
        cy = box["y"] + box["height"] * 0.62
        page.mouse.click(cx, cy)
        page.wait_for_timeout(1500)
        page.screenshot(path="/workspace/wuhan-2-after-click.png", full_page=False)
        print("截图2（点击后）已保存")

        panel = page.locator("h2")
        print(f"面板标题数量: {panel.count()}")
        if panel.count():
            print(f"面板显示的区: {panel.first.inner_text()}")

    # 尝试在面板里添加一条回忆
    title_input = page.locator('input[placeholder*="标题"]').first
    if title_input.count():
        title_input.fill("江边散步")
        page.locator("textarea").first.fill("今晚的长江边很舒服")
        page.locator("button:has-text('添加')").click()
        page.wait_for_timeout(1000)
        page.screenshot(path="/workspace/wuhan-3-after-add.png", full_page=False)
        print("截图3（添加回忆后）已保存")

    print("\n--- 控制台错误/警告 ---")
    for e in errors[:20]:
        print(e)
    if not errors:
        print("（无）")

    browser.close()
