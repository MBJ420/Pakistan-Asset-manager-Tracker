from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto('https://mufap.com.pk/Industry/IndustryStatDaily?tab=1', wait_until='networkidle')
        
        # Wait for the DataTables loading message to disappear and rows to appear
        page.wait_for_timeout(5000)
        
        # Datatables often use an internal API object or we can just grab the text of the table
        table_text = page.locator('#table_id').inner_text()
        print(f"EXTRACTED TEXT:\n{table_text[:1000]}")
        
        browser.close()

if __name__ == "__main__":
    test()
