// Vercel Serverless Function: api/chatbot.js
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const prompt = message.toLowerCase().trim();
        let reply = "I am your Time Table Tracker Assistant! You can ask me about: 'how to add slots', 'view compliance reports', 'change desktop theme', or 'clear database data'.";

        if (prompt.includes('hello') || prompt.includes('hi') || prompt.includes('hey')) {
            reply = "Hello! I am your Study Assistant AI. How can I help you manage your study schedules or logs today?";
        } else if (prompt.includes('add') || prompt.includes('slot') || prompt.includes('create') || prompt.includes('schedule')) {
            reply = "To add a study slot:\n1. Navigate to the 'Timetable' tab.\n2. In the 'Add Study Slot' card, type in the subject name, lesson/topic, set the start/end times, choose a color, and click 'Save Slot'!\nAlternatively, click directly on any slot inside the calendar grid to open the schedule session modal.";
        } else if (prompt.includes('report') || prompt.includes('progress') || prompt.includes('visual') || prompt.includes('periodic')) {
            reply = "To view your progress:\n1. Click the 'Reports' tab in the left sidebar.\n2. Toggle between the 'Actual Studied' and 'Target Scheduled' views.\n3. The interface displays a dynamic, color-coded Periodic Table grid representing your daily compliance rates.";
        } else if (prompt.includes('theme') || prompt.includes('color') || prompt.includes('customize')) {
            reply = "To change the color theme:\n1. Go to the 'Dashboard' view.\n2. In the 'Desk Theme Customization' section at the top, select your preferred theme (Dark Space, Bright Desk, Ocean Breeze, Warm Forest, Neon Sunset, or Minimalist) to change the workspace colors instantly!";
        } else if (prompt.includes('export') || prompt.includes('excel') || prompt.includes('pdf') || prompt.includes('download')) {
            reply = "To download reports:\n1. Click the 'Reports' tab.\n2. Click the 'Export to Excel' or 'Export to PDF' buttons in the top header action area to download files matching your current time filters.";
        } else if (prompt.includes('ashish') || prompt.includes('dey') || prompt.includes('visionary') || prompt.includes('ceo')) {
            reply = "Ashish Dey is the visionary behind the inception of the Time Table Tracker project. As CEO JP, he conceptualized the platform to enable seamless study scheduling and structured session tracking.";
        } else if (prompt.includes('clear') || prompt.includes('delete') || prompt.includes('remove') || prompt.includes('reset')) {
            reply = "If you need to clear database entries:\n- Administrators can manage users and logs via the 'Admin Panel' tab, or clean up specific timetable slots by clicking on them inside the grid and clicking the delete action button.";
        }

        return res.status(200).json({ reply });
    } catch (err) {
        return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    }
};
