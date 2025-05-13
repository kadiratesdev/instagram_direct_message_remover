class InstagramMessageDeleter {
    constructor() {
        this.isDeleteProcessRunning = false;
        this.deleteButton = null;
        this.uiHandler = new UIHandler();
        this.chatFinder = new ChatFinder();
        this.deleteProcessor = new DeleteProcessor();
    }

    init() {
        console.log("Instagram Messages Delete script loaded");
        this.setupScriptInjection();
        this.setupButtonHandling();
    }

    setupScriptInjection() {
        try {
            if (chrome && chrome.runtime) {
                const script = document.createElement("script");
                script.src = chrome.runtime.getURL("js/ins_msg_inject.js");
                document.head.appendChild(script);
            }
        } catch (err) {
            console.log("Runtime error:", err);
        }
    }

    setupButtonHandling() {
        if (window.location.href.includes("/direct")) {
            this.uiHandler.addDeleteButton();
            setInterval(() => this.uiHandler.addDeleteButton(), 3000);
        }
    }

    async startDeletionProcess(limit = 10000) {
        let count = 0;
        this.isDeleteProcessRunning = !this.isDeleteProcessRunning;
        
        const btn = document.querySelector("button.ndy_ins_rm_btn");
        if (btn) {
            if (this.isDeleteProcessRunning) {
                btn.textContent = "Stop Deleting...";
                btn.style.backgroundColor = "#e74c3c";
            } else {
                btn.textContent = "Delete All Messages";
                btn.style.backgroundColor = "#2596be";
                return;
            }
        }

        try {
            if (this.chatFinder.checkLoginRequired()) {
                this.handleLoginRequired();
                return;
            }

            for (let retryCount = 0; count < limit && retryCount < 5;) {
                if (!this.isDeleteProcessRunning) {
                    console.log("Delete process stopped by user");
                    break;
                }

                const chatItem = this.chatFinder.findChatItem();
                if (chatItem) {
                    console.log("Clicking chat item", count + 1);
                    chatItem.click();
                    await this.wait(700);

                    try {
                        if (this.chatFinder.checkLoginRequired()) {
                            this.handleLoginRequired();
                            throw new Error("Login required");
                        }

                        await this.deleteProcessor.performDelete();
                        count++;
                        this.updateButtonText(count);
                        retryCount = 0;
                    } catch (err) {
                        console.error("Error in delete operation:", err);
                        retryCount++;
                    }

                    if (!this.isDeleteProcessRunning) break;
                    await this.wait(count < 10 ? 500 : count < 20 ? 800 : 1000);
                } else {
                    console.log("No chat item found, retry", retryCount + 1);
                    retryCount++;
                    await this.wait(500);
                }

                if (count % 3 === 0) {
                    await this.scrollChats();
                }
            }
        } finally {
            await this.scrollToTop();
            this.finalizeDeletion(count);
        }
    }

    handleLoginRequired() {
        console.error("Login required, please login first");
        alert("Instagram login required. Please login first and try again.");
        this.isDeleteProcessRunning = false;
        this.uiHandler.updateButtonForLogin();
    }

    updateButtonText(count) {
        const btn = document.querySelector("button.ndy_ins_rm_btn");
        if (btn) {
            btn.textContent = `${count} deleted - Click to Stop`;
        }
    }

    finalizeDeletion(count) {
        const btn = document.querySelector("button.ndy_ins_rm_btn");
        if (btn) {
            this.isDeleteProcessRunning = false;
            btn.textContent = count > 0 ? `Done! ${count} deleted` : "Delete All Messages";
            btn.style.backgroundColor = "#2596be";
        }
    }

    async scrollChats() {
        await this.scrollDown();
        await this.wait(300);
        await this.scrollToTop();
        await this.wait(300);
    }

    async scrollDown() {
        const chatList = document.querySelector("div[aria-label='Chats'][role='list']");
        chatList?.firstChild?.firstChild?.firstChild?.scrollTo(0, 600);
    }

    async scrollToTop() {
        const chatList = document.querySelector("div[aria-label='Chats'][role='list']");
        chatList?.firstChild?.firstChild?.firstChild?.scrollTo(0, 0);
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class UIHandler {
    constructor() {
        this.buttonStyle = {
            height: "45px",
            width: "220px",
            backgroundColor: "#2596be",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "16px",
            margin: "15px",
            textAlign: "center",
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "9999",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            transition: "all 0.3s ease",
            fontWeight: "bold"
        };
    }

    addDeleteButton() {
        if (document.querySelector(".ndy_ins_rm_btn")) return;

        const button = document.createElement("button");
        button.innerText = "Delete All Messages";
        button.className = "ndy_ins_rm_btn";
        Object.assign(button.style, this.buttonStyle);

        button.addEventListener("click", () => {
            if (window.instagramDeleter) {
                window.instagramDeleter.startDeletionProcess(10000);
            }
        });

        document.body.appendChild(button);
        console.log("Delete All Messages button added to the page");
    }

    updateButtonForLogin() {
        const btn = document.querySelector("button.ndy_ins_rm_btn");
        if (btn) {
            btn.textContent = "Login Required";
            btn.style.backgroundColor = "#2596be";
            setTimeout(() => {
                btn.textContent = "Delete All Messages";
            }, 3000);
        }
    }
}

class ChatFinder {
    checkLoginRequired() {
        return !!(
            document.querySelector("form[method='post'] input[name='username']") ||
            document.querySelector("div[role='dialog'] form[method='post']") ||
            document.querySelector("input[name='password']") ||
            document.querySelector("div[role='dialog'] input[type='password']")
        );
    }

    findChatItem() {
        if (this.checkLoginRequired()) {
            console.error("Login popup detected during chat selection");
            return null;
        }

        return this.findChatItemByStructure() ||
               this.findChatItemByAvatar() ||
               this.findChatItemByList() ||
               this.findChatItemByLastResort();
    }

    findChatItemByStructure() {
        const structuralSelectors = [
            "div[aria-label='Chats'][role='list'] > div > div > div[style='opacity: 1;']",
            "div[role='list'] > div > div > div[style='opacity: 1;']",
            "div[aria-label='Chats'] div[role='button'][tabindex='-1']",
            "div[role='list'] div[role='button'][tabindex='-1']",
            "div[role='list'] div[role='button']"
        ];

        for (const selector of structuralSelectors) {
            const items = document.querySelectorAll(selector);
            if (items.length > 0) {
                for (const item of items) {
                    if (this.isValidChatItem(item)) {
                        return item;
                    }
                }
            }
        }
        return null;
    }

    isValidChatItem(item) {
        const hasImage = item.querySelector("img") != null;
        const hasSizedDiv = item.querySelector("div[style*='height: 56px']") != null;
        const hasActiveText = item.textContent?.includes("aktifti") || 
                            item.textContent?.includes("aktif") || 
                            item.textContent?.includes("active");
        const hasTimeIndicator = item.querySelector("abbr") != null;

        return (hasImage && (hasSizedDiv || hasTimeIndicator)) || 
               (hasActiveText && hasTimeIndicator);
    }

    findChatItemByAvatar() {
        const avatarImages = document.querySelectorAll("img[alt*='Avatar'], img[referrerpolicy='origin-when-cross-origin']");
        for (const img of avatarImages) {
            if (img.width >= 40 && img.height >= 40) {
                let parent = img;
                for (let i = 0; i < 10; i++) {
                    if (!parent.parentElement) break;
                    parent = parent.parentElement;
                    if (parent.getAttribute('role') === 'button' || parent.tagName === 'BUTTON') {
                        return parent;
                    }
                }
            }
        }
        return null;
    }

    findChatItemByList() {
        const messageList = document.querySelector("div[aria-label='Chats'][role='list']") || 
                          document.querySelector("div[role='list']");
        
        if (messageList) {
            const buttons = messageList.querySelectorAll("[role='button']");
            if (buttons.length > 0) return buttons[0];
            
            const divs = messageList.querySelectorAll("div");
            if (divs.length > 0) return divs[0];
        }
        return null;
    }

    findChatItemByLastResort() {
        const chatListContainer = document.querySelector("div[aria-label='Chats'][role='list']") || 
                                document.querySelector("div[role='list']");
        
        if (chatListContainer) {
            const allDivs = chatListContainer.querySelectorAll("div");
            
            for (const div of allDivs) {
                if (div.style?.opacity === '1') return div;
            }
            
            for (const div of allDivs) {
                if (div.getAttribute('role') === 'button') return div;
            }
            
            if (allDivs.length > 0) return allDivs[0];
        }
        return null;
    }
}

class DeleteProcessor {
    async performDelete() {
        await this.wait(500);
        
        if (this.checkLoginRequired()) {
            throw new Error("Login required");
        }

        const infoButton = await this.findAndClickInfoButton();
        if (!infoButton) {
            console.log("Conversation info button not found");
            return;
        }

        await this.wait(300);
        const deleteButton = await this.findAndClickDeleteButton();
        if (!deleteButton) {
            console.log("Delete button not found");
            return;
        }

        await this.wait(300);
        await this.confirmDeletion();
    }

    checkLoginRequired() {
        return !!document.querySelector("div[role='dialog'] form[method='post']");
    }

    async findAndClickInfoButton() {
        const infoButtons = [
            document.querySelector("svg[aria-label='Konuşma Bilgileri']")?.closest("div[role='button']"),
            document.querySelector("svg[aria-label='Conversation information']")?.closest("div[role='button']"),
            document.querySelector("div.x78zum5.x4uap5.xurb0ha div[aria-expanded='false'][role='button']"),
            document.querySelector("div.x78zum5.x4uap5.xurb0ha div[aria-expanded][role='button']"),
            document.querySelector("div.x78zum5 div[role='button'] svg")?.closest("div[role='button']"),
            document.querySelector("header div[role='button'] svg")?.closest("div[role='button']"),
            document.querySelector("div[aria-expanded='false'][role='button']"),
            document.querySelector("div.x9f619.x1n2onr6.x1ja2u2z.xdt5ytf.x2lah0s.x193iq5w.xeuugli.x78zum5 div[role='button']")
        ];

        const infoButton = infoButtons.find(btn => btn);
        if (infoButton) {
            infoButton.click();
            return infoButton;
        }
        return null;
    }

    async findAndClickDeleteButton() {
        const deleteButton = await this.findDeleteButton();
        if (deleteButton) {
            deleteButton.click();
            return deleteButton;
        }
        return null;
    }

    async findDeleteButton() {
        const results = await Promise.all([
            this.findExactDeleteButton(),
            this.findDeleteButtonByText(),
            this.findDeleteButtonByStyle()
        ]);

        return results.find(result => result) || null;
    }

    async findExactDeleteButton() {
        const exactDeleteButtons = Array.from(document.querySelectorAll('*')).filter(el => 
            el.textContent && 
            (el.textContent.trim() === "Sohbeti sil" || 
             el.textContent.trim() === "Delete chat")
        );

        if (exactDeleteButtons.length > 0) {
            let target = exactDeleteButtons[0];
            while (target && !target.tagName.match(/^(BUTTON|A)$/i) && target.getAttribute('role') !== 'button') {
                target = target.parentElement;
                if (!target) break;
            }
            return target;
        }
        return null;
    }

    async findDeleteButtonByText() {
        const spans = document.querySelectorAll('span');
        for (const span of spans) {
            if (span.textContent && 
                (span.textContent.includes("Sohbeti sil") || 
                 span.textContent.includes("Delete chat"))) {
                let parent = span;
                for (let i = 0; i < 5; i++) {
                    if (!parent || !parent.parentElement) break;
                    parent = parent.parentElement;
                    if (parent.getAttribute('role') === 'button' || 
                        parent.tagName === 'BUTTON') {
                        return parent;
                    }
                }
            }
        }
        return null;
    }

    async findDeleteButtonByStyle() {
        const menuItems = document.querySelectorAll("div[role='button'], button");
        for (const item of menuItems) {
            if (item.textContent && 
                (item.textContent.toLowerCase().includes('sil') ||
                 item.textContent.toLowerCase().includes('delete') ||
                 item.textContent.toLowerCase().includes('kaldır') ||
                 item.textContent.toLowerCase().includes('remove'))) {
                return item;
            }
            
            const style = window.getComputedStyle(item);
            if (style.color.includes('255, 0, 0') || 
                style.color.includes('255, 105, 97')) {
                return item;
            }
        }
        return null;
    }

    async confirmDeletion() {
        const confirmDialog = document.querySelector("div[aria-label][role='dialog']");
        if (!confirmDialog) return;

        const confirmButton = this.findConfirmButton(confirmDialog);
        if (confirmButton) {
            confirmButton.click();
            await this.waitForDialogToDisappear();
        }
    }

    findConfirmButton(dialog) {
        return Array.from(dialog.querySelectorAll('button')).find(btn => 
            btn.textContent && 
            (btn.textContent.trim() === "Sil" || 
             btn.textContent.trim() === "Delete")
        ) || Array.from(dialog.querySelectorAll('button')).find(btn => {
            const style = window.getComputedStyle(btn);
            return style.color.includes("255, 0, 0") || 
                   btn.textContent.toLowerCase().includes("sil") ||
                   btn.textContent.toLowerCase().includes("delete");
        }) || (dialog.querySelectorAll('button').length > 0 ? 
            dialog.querySelectorAll('button')[dialog.querySelectorAll('button').length - 1] : 
            null);
    }

    async waitForDialogToDisappear() {
        try {
            await new Promise((resolve, reject) => {
                let attempts = 0;
                const checkInterval = setInterval(() => {
                    if (!document.querySelector("div[aria-label][role='dialog']")) {
                        clearInterval(checkInterval);
                        resolve();
                    } else if (attempts > 5) {
                        clearInterval(checkInterval);
                        reject(new Error("Dialog didn't disappear"));
                    }
                    attempts++;
                }, 200);
            });
        } catch (e) {
            console.log("Dialog didn't disappear, continuing anyway");
        }
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the application
window.onload = function() {
    window.instagramDeleter = new InstagramMessageDeleter();
    window.instagramDeleter.init();
};
