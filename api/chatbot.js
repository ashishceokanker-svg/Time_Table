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
        const { message, classGrade } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const prompt = message.toLowerCase().trim();
        const grade = classGrade ? classGrade.toLowerCase().trim() : 'general';

        // Detect target class range:
        // 'junior': Class 5th to 8th
        // 'middle': Class 9th to 10th
        // 'senior': Class 11th to 12th
        let level = 'middle';
        if (grade.includes('5') || grade.includes('6') || grade.includes('7') || grade.includes('8')) {
            level = 'junior';
        } else if (grade.includes('11') || grade.includes('12') || grade.includes('admin') || grade.includes('general')) {
            level = 'senior';
        }

        // Detect query language (Hindi/Hinglish vs English)
        const isHindiQuery = prompt.includes('kya') || prompt.includes('kaise') || prompt.includes('samjhao') || prompt.includes('batao') || prompt.includes('kya hota') || prompt.includes('kise kehte') || prompt.includes('kijiye');

        let reply = "";

        // Topic 1: Force (बल)
        if (prompt.includes('force') || prompt.includes('bal ') || prompt.endsWith('bal')) {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (Hinglish):\nForce (बल) basically kisi object ko push (धक्का देना) ya pull (खींचना) karna hota hai.\nउदाहरण:\n- Football ko kick karna (Push).\n- Drawer ko kholna (Pull).\n- Force se aap kisi object ki speed ya direction badal sakte hain!";
                } else if (level === 'middle') {
                    reply = "NCERT Class 9 (Hinglish):\nForce (बल) ek external agency hai jo kisi body ke state of rest ya state of motion ko change karta hai.\n- Formula: F = m × a (Mass × Acceleration)\n- SI Unit: Newton (N) [1 N = 1 kg·m/s²]\n- Newton ke Second Law se derive hota hai.";
                } else {
                    reply = "NCERT Class 11 Physics (Hinglish):\nForce ek vector quantity hai jo rate of change of linear momentum ko represent karti hai.\n- Vector Form: \vec{F} = d\vec{p}/dt = m\vec{a} (agar mass constant hai).\n- Unit dimensions: [M¹ L¹ T⁻²].\n- Vector resolution: \vec{F} = F_x \hat{i} + F_y \hat{j} + F_z \hat{k}.\n- Yeh electromagnetic, gravitational, strong, aur weak fundamental interactions ke roop mein exist karta hai.";
                }
            } else {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (English):\nForce is simply a push or a pull acting on an object.\nExamples:\n- Kicking a ball (Pushing).\n- Opening a door (Pulling).\n- Effects of force: It can change the speed, direction, or shape of an object.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 9-10 (English):\nForce is an external influence capable of changing the state of rest or motion of a body.\n- Formula: F = m × a (Force = Mass × Acceleration)\n- SI Unit: Newton (N)\n- Derived from Newton's Second Law of Motion.";
                } else {
                    reply = "NCERT Class 11-12 Physics (English):\nForce is defined vectorially as the time rate of change of linear momentum:\n\vec{F} = d\vec{p}/dt = d(m\vec{v})/dt.\n- Under Newtonian mechanics with constant mass: \vec{F} = m\vec{a} = m(d²\vec{r}/dt²).\n- Dimensions: [MLT⁻²].\n- Solved components: F_x = m·a_x, F_y = m·a_y, F_z = m·a_z.";
                }
            }
        }

        // Topic 2: Gravity / Gravitation (गुरुत्वाकर्षण)
        else if (prompt.includes('gravit') || prompt.includes('gurutva') || prompt.includes('gravitational')) {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (Hinglish):\nGravity (गुरुत्वाकर्षण) ek aakarshan bal (attracting force) hai jisse Earth sabhi cheezon ko apni taraf kheencht hai.\n- Jab aap ball upar fekte hain, toh gravity use niche kheench leti hai.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 9-10 (Hinglish):\nUniversal Law of Gravitation (NCERT Class 9 Chapter 10):\nDo masses ke beech lagne wala gravitational force unke masses ke product ke directly proportional aur unke beech ke distance ke square ke inversely proportional hota hai.\n- Formula: F = G × (M × m) / d²\n- G (Universal Gravitational Constant) = 6.67 × 10⁻¹¹ N·m²/kg².\n- Acceleration due to gravity (g) on Earth = 9.8 m/s².";
                } else {
                    reply = "NCERT Class 11 Physics (Hinglish):\nGravitational Force conservative field particles ke exchange se lagta hai.\n- Vector Formulation: \vec{F} = -G * (M*m)/r² \hat{r}.\n- Gravitational Potential Energy: U = -G*M*m/r.\n- Escape Velocity: v_e = \sqrt{2GM/R} = \sqrt{2gR}.\n- Orbital Velocity: v_o = \sqrt{GM/r}.";
                }
            } else {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (English):\nGravity is the invisible force that pulls objects toward the center of the Earth.\n- Example: It keeps us on the ground and causes falling objects (like leaves or fruits) to move downward.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 9-10 (English):\nNewton's Law of Universal Gravitation:\nEvery particle attracts every other particle with a force directly proportional to the product of their masses and inversely proportional to the square of the distance between them.\n- Mathematical Form: F = G * (M * m) / r²\n- G = 6.674 × 10⁻¹¹ N·m²/kg²\n- Acceleration due to gravity: g = G*M/R² ≈ 9.8 m/s².";
                } else {
                    reply = "NCERT Class 11-12 Physics (English):\nGravitation is a fundamental conservative interaction governed by:\n\vec{F}_{12} = -G * (m₁m₂/r₁₂²) \hat{r}₁₂.\n- Gravitational Potential: V(r) = -GM/r.\n- Kepler's Third Law (Harmonic Law): T² = (4π² / GM) * a³.\n- Variation of g: with altitude g' = g(1 - 2h/R) and depth g' = g(1 - d/R).";
                }
            }
        }

        // Topic 3: Cell (कोशिका)
        else if (prompt.includes('cell') || prompt.includes('koshika') || prompt.includes('mitochondria')) {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (Hinglish):\nCell (कोशिका) sabhi living organisms ki sabse choti unit (unit of life) hai.\n- Mitochondria ko cell ka 'Powerhouse' (ऊर्जा घर) kaha jata hai kyunki yeh cell ko energy deta hai.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 9 (Hinglish):\nCell: Structural and functional unit of life (NCERT Chapter 5).\n- Mitochondria ATP molecules ke roop mein energy release karta hai.\n- Lysosomes ko 'Suicide Bags' kaha jata hai.\n- Cell Wall sirf plant cells mein paya jata hai jo cellulose ka bana hota hai.";
                } else {
                    reply = "NCERT Class 11 Biology (Hinglish):\nCell structure (Prokaryotic vs Eukaryotic):\n- Prokaryotes mein membrane-bound nucleus nahi hota (nucleoid hota hai) aur 70S ribosomes hote hain.\n- Eukaryotes mein 80S ribosomes aur specialized organelles (Mitochondria, Golgi apparatus, ER) hote hain.\n- Membrane Structure: Singer & Nicolson ka Fluid Mosaic Model phospholipid bilayer aur integrated proteins ko describe karta hai.";
                }
            } else {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (English):\nCells are the basic structural units of all living organisms.\n- Mitochondria is known as the powerhouse of the cell because it generates energy for cell activities.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 9-10 (English):\nCell: Fundamental Unit of Life (NCERT Class 9):\n- Mitochondria: Powerhouse of the cell (produces ATP).\n- Lysosomes: Suicide bags (contain digestive enzymes).\n- Plastids/Chloroplasts: Double-membraned organelles found only in plant cells for photosynthesis.";
                } else {
                    reply = "NCERT Class 11-12 Biology (English):\nCell Biology (NCERT Class 11 Chapter 8):\n- Prokaryotes: Lacks nuclear envelope; circular genomic DNA; 70S ribosomes (composed of 50S and 30S subunits).\n- Eukaryotes: Double-membrane organelles; linear DNA wrapped around histones; 80S ribosomes (60S and 40S subunits).\n- Membrane composition: Fluid mosaic model detailing lipid bilayer fluidity and integral/peripheral proteins.";
                }
            }
        }

        // Topic 4: Photosynthesis (प्रकाश संश्लेषण)
        else if (prompt.includes('photosyn') || prompt.includes('prakash sanshleshan') || prompt.includes('chlorophyll')) {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (Hinglish):\nPhotosynthesis ek aisi prakriya hai jisse green plants sunlight, water aur carbon dioxide (CO2) ka use karke apna food banate hain.\n- Chlorophyll (green pigment) isme sunlight ko absorb karta hai.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 10 (Hinglish):\nPhotosynthesis ka chemical reaction (NCERT Class 10 Chapter 6):\n6CO₂ + 12H₂O + Sunlight + Chlorophyll → C₆H₁₂O₆ (Glucose) + 6O₂ + 6H₂O\nIsme carbon dioxide ka reduction carbohydrate mein aur water ka oxidation oxygen mein hota hai.";
                } else {
                    reply = "NCERT Class 11 Biology (Hinglish):\nPhotosynthesis in Higher Plants (NCERT Class 11 Chapter 13):\n- Light Reaction (Thylakoids): Photolysis of water, ATP and NADPH production via non-cyclic electron transport (Z-scheme).\n- Dark Reaction (Stroma): Carbon assimilation via Calvin C3 Cycle (Carboxylation, Reduction, Regeneration) led by RuBisCO enzyme, or C4 Hatch-Slack pathway with Kranz Anatomy.";
                }
            } else {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (English):\nPhotosynthesis is the process by which green plants prepare their food using water, carbon dioxide, and sunlight in the presence of chlorophyll.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 9-10 (English):\nPhotosynthesis Chemical Equation (NCERT Class 10):\n6CO₂ + 12H₂O + light/chlorophyll → C₆H₁₂O₆ (Glucose) + 6O₂ + 6H₂O\n- Step 1: Absorption of light energy by chlorophyll.\n- Step 2: Conversion of light energy to chemical energy and splitting of water molecules.\n- Step 3: Reduction of carbon dioxide to carbohydrates.";
                } else {
                    reply = "NCERT Class 11-12 Biology (English):\nPhotosynthetic carbon assimilation (NCERT Class 11):\n- Light reactions: Cyclic and non-cyclic photophosphorylation inside thylakoid membranes.\n- C3 Pathway (Calvin Cycle): RuBP acts as primary CO2 acceptor yielding 3-PGA.\n- C4 Pathway (Hatch-Slack): Kranz anatomy structure; primary CO2 acceptor is PEP in mesophyll cells, yielding OAA (Oxaloacetic acid).";
                }
            }
        }

        // Topic 5: Math Quadratic/Linear Equation (गणित)
        else if (prompt.includes('quadratic') || prompt.includes('solve') || prompt.includes('equation') || prompt.includes('math') || prompt.includes('root')) {
            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (Hinglish):\nLinear equations ko solve karne ka step-by-step tareeka:\nProblem: x + 7 = 15\nStep 1: 7 ko RHS pe transfer kijiye (signs change ho jayenge).\nStep 2: x = 15 - 7\nStep 3: Answer x = 8.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 10 Chapter 4 (Hinglish):\nQuadratic Equation ax² + bx + c = 0 ke roots nikalne ka step-by-step tareeka:\nRoots Formula (Sridharacharya Method):\nx = [-b ± \sqrt{b² - 4ac}] / 2a\nStep 1: Discriminant D = b² - 4ac nikaliye.\nStep 2: Agar D >= 0 hai, toh real roots honge.\nStep 3: Formula mein values rakh kar solutions nikal lijiye.";
                } else {
                    reply = "NCERT Class 11-12 Math (Hinglish):\nComplex roots aur Quadratic form relations:\nRoots of ax² + bx + c = 0 where discriminant D = b² - 4ac < 0 are given by complex conjugate pairs:\nx = [-b ± i\sqrt{|D|}] / 2a.\n- Roots ki relations: α + β = -b/a, α·β = c/a.\n- Equations ko vectors ya matrix determinants se transform kiya jata hai.";
                }
            } else {
                if (level === 'junior') {
                    reply = "NCERT Class 6-8 (English):\nStep-by-step Linear Equation Solution:\nLet's solve: 2x - 4 = 10\nStep 1: Shift constant to right-hand side: 2x = 10 + 4\nStep 2: 2x = 14\nStep 3: Divide by 2: x = 14 / 2 => x = 7.";
                } else if (level === 'middle') {
                    reply = "NCERT Class 10 (English):\nStep-by-step Quadratic Equation Solver for ax² + bx + c = 0:\n1. Identify coefficients a, b, and c.\n2. Compute Discriminant D = b² - 4ac.\n3. Apply Quadratic Formula:\n   x = [-b ± \sqrt{D}] / 2a\nExample: x² - 5x + 6 = 0\n- a = 1, b = -5, c = 6\n- D = (-5)² - 4(1)(6) = 25 - 24 = 1\n- Roots: x = [5 ± \sqrt{1}] / 2 => x = 3 and x = 2.";
                } else {
                    reply = "NCERT Class 11-12 Math (English):\nComplex Roots of Quadratic Equations (NCERT Class 11 Chapter 5):\nFor ax² + bx + c = 0 where D = b² - 4ac < 0:\nx = [-b ± i\sqrt{4ac - b²}] / 2a.\n- Fundamental Theorem of Algebra guarantees exactly n roots for a polynomial of degree n.\n- Discriminant properties determine real, distinct, equal, or imaginary conjugate roots.";
                }
            }
        }

        // Generic NCERT Class-Aware Responder
        else {
            const hindiContext = "Main aapka CBSE/NCERT AI Study Assistant hoon. Aap mujhse Science, Mathematics, English ya Social Science se related doubts pooch sakte hain.";
            const englishContext = "I am your CBSE/NCERT AI Study Assistant. Please ask any doubt related to Mathematics, Science (Physics/Chemistry/Biology), Social Science, or English.";

            if (isHindiQuery) {
                if (level === 'junior') {
                    reply = `NCERT Class ${grade.toUpperCase()} (Hinglish):\n${hindiContext}\n- Class 5th-8th ke subjects ke questions ka asaan answers dunga!`;
                } else if (level === 'middle') {
                    reply = `NCERT Class ${grade.toUpperCase()} (Hinglish):\n${hindiContext}\n- Class 9th-10th board level syllabus ke explanations and numerical solutions standard forms mein provide karunga.`;
                } else {
                    reply = `NCERT Class ${grade.toUpperCase()} (Hinglish):\n${hindiContext}\n- Class 11th-12th advanced formulas, derivations, aur detailed NCERT text questions solve karunga.`;
                }
            } else {
                if (level === 'junior') {
                    reply = `NCERT Class ${grade.toUpperCase()} (English):\n${englishContext}\n- I will provide simple, interactive, concept-based NCERT solutions tailored for Class 5th to 8th standard.`;
                } else if (level === 'middle') {
                    reply = `NCERT Class ${grade.toUpperCase()} (English):\n${englishContext}\n- I will provide detailed, board-aligned step-by-step CBSE solutions for Class 9th and 10th.`;
                } else {
                    reply = `NCERT Class ${grade.toUpperCase()} (English):\n${englishContext}\n- I will provide advanced academic answers with mathematical derivations and vector formulations for Class 11th and 12th.`;
                }
            }
        }

        return res.status(200).json({ reply });
    } catch (err) {
        return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    }
};
