document.addEventListener('DOMContentLoaded', function() {
    const deleteButton = document.getElementById('deleteButton');
    
    deleteButton.addEventListener('click', function() {
        // Get the active tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const activeTab = tabs[0];
            
            // Check if we're on Instagram direct messages page
            if (activeTab.url.includes('instagram.com/direct')) {
                // Inject the content script
                chrome.scripting.executeScript({
                    target: {tabId: activeTab.id},
                    function: startDeletion
                });
            } else {
                // If not on Instagram direct messages, open it
                chrome.tabs.create({
                    url: 'https://www.instagram.com/direct/inbox/'
                });
            }
        });
    });
});

function startDeletion() {
    if (window.instagramDeleter) {
        window.instagramDeleter.startDeletionProcess(10000);
    } else {
        console.error('Instagram deleter not initialized');
    }
}