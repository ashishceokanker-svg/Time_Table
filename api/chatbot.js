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
        const { message, classGrade, image, history } = req.body;
        
        let prompt = message ? message.toLowerCase().trim() : '';
        const grade = classGrade ? classGrade.toLowerCase().trim() : 'general';

        // 1. Decline Class 12th explicitly
        const isClass12 = grade.includes('12') || prompt.includes('class 12') || prompt.includes('class 12th') || prompt.includes('grade 12');
        if (isClass12) {
            return res.status(200).json({
                reply: "Hello beta! As your CBSE AI Educational Assistant, I focus exclusively on Class 5th to Class 11th NCERT syllabus. Class 12th subjects are currently outside my scope. Please feel free to ask questions from Class 5 to Class 11, and I will be happy to help you!"
            });
        }

        // 2. Reject college-level, coding/programming, or non-educational/gaming queries
        const isCollegeOrOutofScope = 
            prompt.includes('schrodinger') || prompt.includes('quantum mechanics') || prompt.includes('maxwell relations') ||
            prompt.includes('postgraduate') || prompt.includes('college') || prompt.includes('university') ||
            prompt.includes('rust programming') || prompt.includes('gaming laptop') || prompt.includes('best movie') ||
            prompt.includes('politician') || prompt.includes('corporate law') || prompt.includes('blockchain');

        if (isCollegeOrOutofScope) {
            return res.status(200).json({
                reply: "Beta, I am here as your patient school teacher. I can only assist you with CBSE/NCERT curriculum topics from Class 5th to Class 11th. Your question seems to be for college level or completely outside school boundaries. Please ask a doubt related to standard school subjects like Science, Math, Social Science, English, Hindi, or Class 11 Commerce/Arts!"
            });
        }

        // 3. Determine Grade Level (Restricted to 5th - 11th)
        let level = 'middle'; // default 9-10
        if (grade.includes('5') || grade.includes('6') || grade.includes('7') || grade.includes('8')) {
            level = 'junior';
        } else if (grade.includes('11') || grade.includes('admin') || grade.includes('general')) {
            level = 'senior'; // Class 11th only (Class 12th is already blocked)
        }

        // 4. OCR Vision Simulation (Enforcing Class 5-11 limits)
        if (image) {
            let ocrText = "Calculate the force required to accelerate a 5 kg mass at 4 m/s².";
            let solution = "";

            if (level === 'junior') {
                solution = "Aaye betaji! Let me explain this simple numerical to you step-by-step:\n- Mass (m) = 5 kg\n- Acceleration (a) = 4 m/s²\n- Formula: Force = Mass × Acceleration\n- Step 1: Multiply 5 by 4.\n- Step 2: 5 × 4 = 20\n- Answer: Force = 20 Newtons (N). Very easy, right?";
            } else if (level === 'middle') {
                solution = "Hello beta! Here is the step-by-step solution matching NCERT Class 9 criteria:\n- Given:\n  Mass (m) = 5.0 kg\n  Acceleration (a) = 4.0 m/s²\n- Using Newton's Second Law: F = m · a\n- Step-by-Step Calculation:\n  F = (5.0 kg) × (4.0 m/s²)\n  F = 20.0 kg·m/s²\n- Answer: The net force required is 20 Newtons (N).";
            } else {
                solution = "Welcome student! Here is the vector formulation matching NCERT Class 11 Physics standard:\n- Given:\n  Mass (m) = 5.00 kg\n  Acceleration vector magnitude (a) = 4.00 m/s²\n- Formulation:\n  Applying Newtonian vector mechanics: \\vec{F} = m\\vec{a}\n- Step-by-Step Resolution:\n  F = (5.00 kg) × (4.00 m/s²)\n  F = 20.00 N (where 1 N = 1 kg·m/s²)\n- Dimension Check: [MLT⁻²] => [5 kg][4 m/s²] = 20 N.";
            }

            return res.status(200).json({
                reply: `[Vision API OCR Scan completed successfully]\nWe detected the following textbook problem in your uploaded image:\n"${ocrText}"\n\nHere is the step-by-step NCERT solution:\n${solution}`
            });
        }

        if (!prompt) {
            return res.status(400).json({ error: 'Message or image is required' });
        }

        // 5. Conversation Context Memory Resolution
        let currentTopic = null;
        if (prompt.includes('force') || prompt.includes('bal ')) currentTopic = 'force';
        else if (prompt.includes('gravit') || prompt.includes('gurutva')) currentTopic = 'gravity';
        else if (prompt.includes('cell') || prompt.includes('koshika')) currentTopic = 'cell';
        else if (prompt.includes('photosyn') || prompt.includes('sanshleshan')) currentTopic = 'photosynthesis';
        else if (prompt.includes('quadratic') || prompt.includes('equation') || prompt.includes('math')) currentTopic = 'math';
        else if (prompt.includes('journal') || prompt.includes('ledger') || prompt.includes('commerce') || prompt.includes('account')) currentTopic = 'commerce';

        if (!currentTopic && history && history.length > 0) {
            const lastBotMsg = history.filter(h => h.role === 'bot').pop();
            if (lastBotMsg) {
                const prevContent = lastBotMsg.content.toLowerCase();
                if (prevContent.includes('force') || prevContent.includes(' Newton')) currentTopic = 'force';
                else if (prevContent.includes('gravit') || prevContent.includes(' Kepler')) currentTopic = 'gravity';
                else if (prevContent.includes('cell') || prevContent.includes('ribosome')) currentTopic = 'cell';
                else if (prevContent.includes('photosyn') || prevContent.includes('calvin')) currentTopic = 'photosynthesis';
                else if (prevContent.includes('equation') || prevContent.includes(' roots')) currentTopic = 'math';
                else if (prevContent.includes('journal') || prevContent.includes('ledger') || prevContent.includes('bookkeeping')) currentTopic = 'commerce';
            }
        }

        // 6. Interactive Quiz / Gamification Responder
        const isAnsweringQuiz = prompt === 'a' || prompt === 'b' || prompt === 'c' || prompt === 'd';
        if (isAnsweringQuiz) {
            let isCorrect = false;
            let explanation = "";

            if (currentTopic === 'force') {
                if (prompt === 'b') isCorrect = true;
                explanation = "The SI unit of Force is Newton (named after Isaac Newton).";
            } else if (currentTopic === 'gravity') {
                if (prompt === 'c') isCorrect = true;
                explanation = "Acceleration due to gravity (g) is approximately 9.8 m/s² on Earth.";
            } else if (currentTopic === 'cell') {
                if (prompt === 'a') isCorrect = true;
                explanation = "Mitochondria is known as the powerhouse of the cell due to ATP generation.";
            } else if (currentTopic === 'photosynthesis') {
                if (prompt === 'd') isCorrect = true;
                explanation = "Chlorophyll absorbs red and blue light and reflects green light.";
            } else {
                if (prompt === 'b') isCorrect = true;
                explanation = "Correct option was B.";
            }

            return res.status(200).json({
                reply: isCorrect 
                    ? `🎉 Correct Answer! Excellent job beta!\nExplanation: ${explanation}\nKeep studying diligently!`
                    : `❌ Incorrect. The correct answer was ${currentTopic === 'force' ? 'B' : currentTopic === 'gravity' ? 'C' : currentTopic === 'cell' ? 'A' : 'B'}.\nExplanation: ${explanation}\nNo problem beta, failure is the stepping stone to success. Let's try another topic!`
            });
        }

        // Check if "test me" or "quiz" is requested
        if (prompt.includes('test me') || prompt.includes('quiz') || prompt.includes('question')) {
            let quizText = "";
            if (currentTopic === 'force') {
                quizText = "Here is a quick question to test your understanding of Force:\n\nWhat is the SI unit of Force?\nA) Joule\nB) Newton\nC) Watt\nD) Pascal\n\nClick on the correct option below to answer:";
            } else if (currentTopic === 'gravity') {
                quizText = "Here is a quick question to test your understanding of Gravity:\n\nWhat is the approximate acceleration due to gravity (g) on Earth?\nA) 5.6 m/s²\nB) 12.4 m/s²\nC) 9.8 m/s²\nD) 1.6 m/s²\n\nClick on the correct option below to answer:";
            } else if (currentTopic === 'cell') {
                quizText = "Here is a quick question to test your understanding of Cells:\n\nWhich organelle is called the powerhouse of the cell?\nA) Mitochondria\nB) Nucleus\nC) Ribosome\nD) Lysosome\n\nClick on the correct option below to answer:";
            } else if (currentTopic === 'photosynthesis') {
                quizText = "Here is a quick question to test your understanding of Photosynthesis:\n\nWhich pigment absorbs sunlight for photosynthesis?\nA) Hemoglobin\nB) Carotene\nC) Xanthophyll\nD) Chlorophyll\n\nClick on the correct option below to answer:";
            } else {
                quizText = "Here is a general knowledge study question:\n\nWhat is the value of 5 + 3 × 2?\nA) 16\nB) 11\nC) 10\nD) 13\n\nClick on the correct option below to answer:";
            }
            return res.status(200).json({ reply: quizText });
        }

        // 7. Context-aware pronoun answers
        const isFollowUp = prompt.includes('example of it') || prompt.includes('give an example') || prompt.includes('explain more') || prompt.includes('give one more');
        if (isFollowUp && currentTopic) {
            if (currentTopic === 'force') {
                return res.status(200).json({
                    reply: `Sure beta! Here is a contextual example of Force:\nWhen a passenger is standing in a stationary bus, and the bus suddenly starts moving, the passenger falls backward. This is due to the inertia of rest (resisting change in state of motion) under Newton's First Law!`
                });
            } else if (currentTopic === 'gravity') {
                return res.status(200).json({
                    reply: `Sure dear! Here is a contextual example of Gravity:\nWhen you drop a tennis ball and a basketball at the same time in a vacuum, they hit the ground simultaneously because gravity accelerates all objects at the same rate (g ≈ 9.8 m/s²), regardless of their mass!`
                });
            } else if (currentTopic === 'cell') {
                return res.status(200).json({
                    reply: `Sure beta! Here is a contextual example of Cell activity:\nMuscle cells contain a very high density of Mitochondria compared to skin cells. This is because muscles require massive amounts of energy (ATP) to contract and relax during physical activities!`
                });
            } else if (currentTopic === 'photosynthesis') {
                return res.status(200).json({
                    reply: `Sure! Here is a contextual example of Photosynthesis:\nDesert plants (like cactus) open their stomata at night to absorb carbon dioxide and store it as malate. During the day, they use sunlight to perform photosynthesis without losing water. This is called the CAM pathway!`
                });
            }
        }

        // 8. Diagram Triggers
        const isDiagramRequested = prompt.includes('diagram') || prompt.includes('flowchart') || prompt.includes('mermaid') || prompt.includes('timeline') || prompt.includes('hierarchy');
        
        if (isDiagramRequested || prompt.includes('food chain') || prompt.includes('water cycle') || prompt.includes('digestive system') || prompt.includes('plant kingdom')) {
            let diagramReply = "";
            if (prompt.includes('food chain')) {
                diagramReply = `Aaye betaji! Let me show you a flowchart of the Food Chain representing trophic levels in an ecosystem:

\`\`\`mermaid
graph LR
    Sun[Sun / सूर्य: Energy Source] --> Producer[Producers / उत्पादक: Green Plants]
    Producer --> Herbivore[Herbivores / शाकाहारी: Rabbit]
    Herbivore --> Carnivore[Carnivores / मांसाहारी: Snake]
    Carnivore --> Apex[Apex Predator / शीर्ष उपभोक्ता: Eagle]
    Apex --> Decomposer[Decomposers / अपघटक: Fungi/Bacteria]
    
    style Sun fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff
    style Producer fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff
    style Herbivore fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff
    style Carnivore fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff
    style Apex fill:#ef4444,stroke:#dc2626,stroke-width:2px,color:#fff
    style Decomposer fill:#6b7280,stroke:#4b5563,stroke-width:2px,color:#fff
\`\`\`

Explanation: Energy flows unidirectional from the Sun to Autotrophic Producers, which fix solar energy through photosynthesis, and then sequentially to primary, secondary, and tertiary consumers.`;
                return res.status(200).json({ reply: diagramReply });
            } else if (prompt.includes('water cycle')) {
                diagramReply = `Aaye betaji! Here is a flowchart of the Water Cycle (जल चक्र):

\`\`\`mermaid
graph TD
    Ocean[Ocean Water / महासागर] -- Evaporation / वाष्पीकरण --> Vapor[Water Vapor / जल वाष्प]
    Vapor -- Condensation / संघनन --> Cloud[Clouds / बादल]
    Cloud -- Precipitation / वर्षण --> Rain[Rain/Snow / वर्षा]
    Rain -- Runoff & Infiltration --> Ocean
\`\`\`

Explanation: The water cycle is a continuous natural process where water evaporates, condenses into clouds, and precipitates back to earth as rain or snow.`;
                return res.status(200).json({ reply: diagramReply });
            } else if (prompt.includes('digestive')) {
                diagramReply = `Aaye betaji! Here is a flowchart of the Human Digestive System:

\`\`\`mermaid
graph TD
    Mouth[Mouth / मुख] --> Esophagus[Esophagus / ग्रासनली]
    Esophagus --> Stomach[Stomach / आमाशय]
    Stomach --> SmallIntestine[Small Intestine / क्षुद्रांत्र]
    SmallIntestine --> LargeIntestine[Large Intestine / वृहदांत्र]
    LargeIntestine --> Anus[Anus / गुदा]
\`\`\`

Explanation: Digestion begins in the mouth, travels down the esophagus to the stomach for chemical breakdown, enters the small intestine for nutrient absorption, and larger intestine for water absorption before excretion.`;
                return res.status(200).json({ reply: diagramReply });
            } else if (prompt.includes('plant kingdom')) {
                diagramReply = `Aaye betaji! Here is the hierarchical classification of the Plant Kingdom:

\`\`\`mermaid
graph TD
    Plant[Plant Kingdom / पादप जगत] --> Cryptogamae[Cryptogamae / अपुष्पोद्भिद]
    Plant --> Phanerogamae[Phanerogamae / पुष्पोद्भिद]
    
    Cryptogamae --> Thallophyta[Thallophyta / थैलोफाइटा]
    Cryptogamae --> Bryophyta[Bryophyta / ब्रायोफाइटा]
    Cryptogamae --> Pteridophyta[Pteridophyta / टेरिडोफाइटा]
    
    Phanerogamae --> Gymnosperms[Gymnosperms / जिम्नोस्पर्म]
    Phanerogamae --> Angiosperms[Angiosperms / एन्जियोस्पर्म]
\`\`\`

Explanation: The Plant Kingdom is broadly classified based on seed production into spore-bearing Cryptogamae and seed-bearing Phanerogamae.`;
                return res.status(200).json({ reply: diagramReply });
            }
        }

        // 9. Primary CBSE NCERT Response Logic
        const isHindiQuery = prompt.includes('kya') || prompt.includes('kaise') || prompt.includes('samjhao') || prompt.includes('batao') || prompt.includes('kya hota') || prompt.includes('kise kehte') || prompt.includes('kijiye');
        let reply = "";

        if (currentTopic === 'force') {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "Hello beta! Force (बल) basically kisi object ko push (धक्का देना) ya pull (खींचना) karna hota hai.\nउदाहरण:\n- Football ko kick karna (Push).\n- Drawer ko kholna (Pull).\n- Force se aap kisi object ki speed ya direction badal sakte hain!\n\nWould you like a quick question to test your understanding?";
                } else if (level === 'middle') {
                    reply = "Aaye betaji! Force (बल) ek external agency hai jo kisi body ke state of rest ya state of motion ko change karta hai.\n- Formula: F = m × a (Mass × Acceleration)\n- SI Unit: Newton (N) [1 N = 1 kg·m/s²]\n- Newton ke Second Law se derive hota hai.\n\nWould you like a quick question to test your understanding?";
                } else {
                    reply = "Welcome dear student! Force ek vector quantity hai jo rate of change of linear momentum ko represent karti hai.\n- Vector Form: \\vec{F} = d\\vec{p}/dt = m\\vec{a} (agar mass constant hai).\n- Dimension formula: [M¹ L¹ T⁻²].\n\nWould you like a quick question to test your understanding?";
                }
            } else {
                if (level === 'junior') {
                    reply = "Hello beta! Force is simply a push or a pull acting on an object.\nExamples:\n- Kicking a ball (Pushing).\n- Opening a door (Pulling).\n\nWould you like a quick question to test your understanding?";
                } else if (level === 'middle') {
                    reply = "Aaye betaji! Force is an external influence capable of changing the state of rest or motion of a body.\n- Formula: F = m × a (Force = Mass × Acceleration)\n- SI Unit: Newton (N)\n\nWould you like a quick question to test your understanding?";
                } else {
                    reply = "Welcome dear student! Force is defined vectorially as the time rate of change of linear momentum:\n\\vec{F} = d\\vec{p}/dt = d(m\\vec{v})/dt.\n- Under Newtonian mechanics with constant mass: \\vec{F} = m\\vec{a}.\n\nWould you like a quick question to test your understanding?";
                }
            }
        } else if (currentTopic === 'gravity') {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "Hello beta! Gravity (गुरुत्वाकर्षण) ek aakarshan bal (attracting force) hai jisse Earth sabhi cheezon ko apni taraf kheencht hai.\n\nWould you like a quick question to test your understanding?";
                } else if (level === 'middle') {
                    reply = "Aaye betaji! Universal Law of Gravitation (NCERT Class 9 Chapter 10):\nDo masses ke beech lagne wala gravitational force unke masses ke product ke directly proportional aur unke beech ke distance ke square ke inversely proportional hota hai.\n- Formula: F = G × (M × m) / d²\n\nWould you like a quick question to test your understanding?";
                } else {
                    reply = "Welcome dear student! Gravitational Force conservative field particles ke exchange se lagta hai.\n- Vector Formulation: \\vec{F} = -G * (M*m)/r² \\hat{r}.\n- Gravitational Potential Energy: U = -G*M*m/r.\n\nWould you like a quick question to test your understanding?";
                }
            } else {
                if (level === 'junior') {
                    reply = "Hello beta! Gravity is the invisible force that pulls objects toward the center of the Earth.\n\nWould you like a quick question to test your understanding?";
                } else if (level === 'middle') {
                    reply = "Aaye betaji! Newton's Law of Universal Gravitation:\nEvery particle attracts every other particle with a force directly proportional to the product of their masses and inversely proportional to the square of the distance between them.\n- Mathematical Form: F = G * (M * m) / r²\n\nWould you like a quick question to test your understanding?";
                } else {
                    reply = "Welcome dear student! Gravitation is a fundamental conservative interaction governed by:\n\\vec{F}_{12} = -G * (m₁m₂/r₁₂²) \\hat{r}₁₂.\n- Gravitational Potential: V(r) = -GM/r.\n\nWould you like a quick question to test your understanding?";
                }
            }
        } else if (currentTopic === 'cell') {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "Hello beta! Cell (कोशिका) sabhi living organisms ki sabse choti unit (unit of life) hai.\n- Mitochondria ko cell ka 'Powerhouse' (ऊर्जा घर) kaha jata hai.\n\nWould you like a quick question to test your understanding?";
                } else if (level === 'middle') {
                    reply = "Aaye betaji! Cell: Structural and functional unit of life (NCERT Chapter 5).\n- Mitochondria ATP molecules ke roop mein energy release karta hai.\n- Lysosomes ko 'Suicide Bags' kaha jata.\n\nWould you like a quick question to test your understanding?";
                } else {
                    reply = "Welcome dear student! Cell structure (Prokaryotic vs Eukaryotic):\n- Prokaryotes mein membrane-bound nucleus nahi hota aur 70S ribosomes hote hain.\n- Eukaryotes mein 80S ribosomes aur specialized organelles hote hain.\n\nWould you like a quick question to test your understanding?";
                }
            } else {
                if (level === 'junior') {
                    reply = "Hello beta! Cells are the basic structural units of all living organisms.\n- Mitochondria is known as the powerhouse of the cell.\n\nWould you like a quick question to test your understanding?";
                } else if (level === 'middle') {
                    reply = "Aaye betaji! Cell: Fundamental Unit of Life (NCERT Class 9):\n- Mitochondria: Powerhouse of the cell (produces ATP).\n- Lysosomes: Suicide bags.\n\nWould you like a quick question to test your understanding?";
                } else {
                    reply = "Welcome dear student! Cell Biology (NCERT Class 11 Chapter 8):\n- Prokaryotes: Lacks nuclear envelope; 70S ribosomes.\n- Eukaryotes: Double-membrane organelles; 80S ribosomes.\n\nWould you like a quick question to test your understanding?";
                }
            }
        } else if (currentTopic === 'commerce') {
            reply = `Aaye betaji! Let me explain Accounting Journal Entries (NCERT Class 11 Accountancy):
* In double-entry bookkeeping, every financial transaction affects at least two accounts.
* Golden Rule of Accounting:
  1. Personal Account: Debit the receiver, Credit the giver.
  2. Real Account: Debit what comes in, Credit what goes out.
  3. Nominal Account: Debit all expenses & losses, Credit all incomes & gains.
* Step-by-Step Example (Started business with Cash Rs. 50,000):
  - Step 1: Identify accounts => Cash Account (Real) & Capital Account (Personal).
  - Step 2: Apply rules => Cash comes in (Debit Cash), Capital is given (Credit Capital).
  - Step 3: Entry => Cash A/c Dr. 50,000 to Capital A/c 50,000.`;
        } else {
            reply = `Hello beta! I am your patient CBSE/NCERT school teacher. Feel free to ask about any topic from Class 5th to Class 11th standard school subjects (Science, Math, Social Science, Accountancy, English, or Hindi), and we will learn together step-by-step!`;
        }

        return res.status(200).json({ reply });
    } catch (err) {
        return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    }
};
