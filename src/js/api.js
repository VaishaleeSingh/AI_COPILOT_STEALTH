import { setStatus, setActiveAPI } from "./ui.js";

// ─── LLM Helper (Custom > OpenRouter > Groq > Gemini fallback, with retry) ──
async function callLLM(sysPrompt, userPrompt, KEYS, maxTokens = 2000, temperature = 0.1) {
  // Build provider list in priority order
  const providers = [];

  const anthropicKey = KEYS.anthropicKey || "";
  const customBase = KEYS.customLlmBaseUrl || "";
  const openrouterKey = KEYS.openrouterKey || "";
  const groqKey = KEYS.groqKey || "";
  const geminiKey = KEYS.geminiKey || "";

  // ── Anthropic Claude API (highest priority, different format) ──
  if (anthropicKey) {
    try {
      const anthropicModel = KEYS.anthropicModel || "claude-sonnet-4-20250514";
      setActiveAPI(`Calling Claude (${anthropicModel})…`, "rgba(180, 130, 255, 0.5)");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: Math.min(maxTokens, 4000),
          system: sysPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature,
        }),
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (res.ok && data.content?.[0]?.text) {
        setActiveAPI(`Claude (${anthropicModel})`, "rgba(180, 130, 255, 0.8)");
        return data.content[0].text;
      }
      console.warn("Anthropic LLM failed:", data.error?.message || `HTTP ${res.status}`);
    } catch (e) {
      console.warn("Anthropic LLM error:", e.message);
    }
  }

  if (customBase) {
    const h = { "Content-Type": "application/json" };
    if (KEYS.customLlmApiKey) h["Authorization"] = `Bearer ${KEYS.customLlmApiKey}`;
    if (KEYS.customLlmHeaderName && KEYS.customLlmHeaderValue) {
      h[KEYS.customLlmHeaderName] = KEYS.customLlmHeaderValue;
    }
    providers.push({
      name: "Custom",
      url: `${customBase.replace(/\/+$/, "")}/chat/completions`,
      model: KEYS.customLlmModel || "gpt-4o",
      headers: h,
    });
  }
  if (openrouterKey) {
    providers.push({
      name: "OpenRouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: KEYS.openrouterModel || "deepseek/deepseek-r1",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openrouterKey}` },
    });
  }
  if (groqKey) {
    providers.push({
      name: "Groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: "moonshotai/kimi-k2-instruct-0905",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    });
  }

  // Try each OpenAI-compatible provider
  for (const p of providers) {
    try {
      setActiveAPI(`Calling ${p.name} (${p.model})…`, "rgba(255, 255, 255, 0.4)");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const res = await fetch(p.url, {
        method: "POST",
        headers: p.headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (res.ok && data.choices?.[0]?.message?.content) {
        setActiveAPI(`${p.name} (${p.model})`, p.name === "Groq" ? "rgba(255, 180, 100, 0.8)" : "rgba(100, 200, 255, 0.8)");
        return data.choices[0].message.content;
      }
      console.warn(`${p.name} LLM failed:`, data.error?.message || `HTTP ${res.status}`);
    } catch (e) {
      console.warn(`${p.name} LLM error:`, e.message);
    }
  }

  // Gemini fallback (different API format)
  if (geminiKey) {
    try {
      setActiveAPI("Calling Gemini (flash-lite)…", "rgba(100, 220, 180, 0.5)");
      console.log("Falling back to Gemini…");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: sysPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature },
          }),
        },
      );
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text) {
        setActiveAPI("Gemini (flash-lite)", "rgba(100, 220, 180, 0.8)");
        return text;
      }
      console.warn("Gemini returned empty:", data.error?.message || "no content");
    } catch (e) {
      console.warn("Gemini fallback error:", e.message);
    }
  }

  setActiveAPI("All providers failed", "rgba(255, 100, 100, 0.8)");
  console.error("All LLM providers failed.");
  return "";
}

// ─── JSON Parser Helper ──────────────────────────────────────────────────────
function parseJSON(text) {
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const startIdx = clean.indexOf("{");
  const endIdx = clean.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1) {
    // Try array
    const arrStart = clean.indexOf("[");
    const arrEnd = clean.lastIndexOf("]");
    if (arrStart !== -1 && arrEnd !== -1)
      clean = clean.substring(arrStart, arrEnd + 1);
  } else {
    clean = clean.substring(startIdx, endIdx + 1);
  }
  return JSON.parse(clean);
}

// ─── Code Executor Helper (Judge0 CE primary → RapidAPI fallback) ────────────
// Judge0 CE: free, no API key, returns { stdout, stderr, compile_output, status: { id, description } }
// We normalize all responses to: { status: "success"|"failed", stdout, stderr, exception }
async function runOnRapidAPI(code, selectedLang, rapidApiKey) {
  // ── Try 1: Judge0 CE (free, no key needed) ──
  const judge0LangMap = {
    cpp: 54,       // C++ (GCC 9.2.0)
    python: 71,    // Python (3.8.1)
    java: 62,      // Java (OpenJDK 13.0.1)
    javascript: 63, // JavaScript (Node.js 12.14.0)
    go: 60,        // Go (1.13.5)
  };
  const langId = judge0LangMap[selectedLang] || 54;

  try {
    const res = await fetch(
      "https://ce.judge0.com/submissions/?base64_encoded=false&wait=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: code,
          language_id: langId,
          stdin: "",
        }),
      },
    );

    if (res.ok) {
      const data = await res.json();
      console.log("Judge0 Response:", JSON.stringify(data).substring(0, 500));

      // Normalize Judge0 response to match our expected format
      // Judge0 status ids: 3=Accepted, 4=Wrong Answer, 5=Time Limit, 6=Compilation Error,
      //                    7-12=Runtime errors, 13=Internal Error, 14=Exec Format Error
      const statusId = data.status?.id || 0;
      const isAccepted = statusId === 3;

      return {
        status: isAccepted ? "success" : "failed",
        stdout: data.stdout || "",
        stderr: data.stderr || "",
        exception: isAccepted ? null : (data.compile_output || data.stderr || data.message || data.status?.description || null),
      };
    }

    const errText = await res.text();
    console.warn(`Judge0 failed (HTTP ${res.status}): ${errText.substring(0, 200)}. Falling back to RapidAPI…`);
  } catch (e) {
    console.warn("Judge0 fetch error:", e.message, ". Falling back to RapidAPI…");
  }

  // ── Try 2: RapidAPI OneCompiler (if key provided) ──
  if (rapidApiKey) {
    const rapidLangMap = {
      cpp: { name: "main.cpp", rapid: "cpp" },
      python: { name: "main.py", rapid: "python" },
      java: { name: "Main.java", rapid: "java" },
      javascript: { name: "main.js", rapid: "nodejs" },
      go: { name: "main.go", rapid: "go" },
    };
    const { name: fileName, rapid } = rapidLangMap[selectedLang] || rapidLangMap.cpp;

    const res = await fetch(
      "https://onecompiler-apis.p.rapidapi.com/api/v1/run",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "onecompiler-apis.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
        body: JSON.stringify({
          language: rapid,
          stdin: "",
          files: [{ name: fileName, content: code }],
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RapidAPI HTTP ${res.status}: ${text.substring(0, 300)}`);
    }

    const data = await res.json();
    console.log("RapidAPI Response:", JSON.stringify(data).substring(0, 500));
    return data;
  }

  throw new Error("All code execution APIs failed. Check your internet connection.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT 1 — Test Case Generator
// Step 1: Generates ~10 test cases with inputs + expected outputs
// Step 2: Generates a simple brute-force reference solution
// Step 3: Runs the reference solution on RapidAPI to VERIFY expected outputs
// Step 4: Replaces LLM-guessed outputs with actual execution outputs
// ═══════════════════════════════════════════════════════════════════════════════
async function agentTestCaseGenerator(
  problem,
  outputFormat,
  userLogic,
  selectedLang,
  codeLangName,
  KEYS,
) {
  const rapidApiKey = KEYS.rapidKey || "";

  // ── Step 1: Generate test cases ───────────────────────────────────────────
  setStatus("● AGENT 1: Generating test cases…", "var(--green)");

  const tcSysPrompt = `You are an expert competitive programmer and test engineer.
Generate exactly 10 test cases for the given coding problem. Be concise.

Include:
- Problem's own examples (copy EXACTLY from problem statement) (2-3)
- Edge cases: empty/single element, min/max values, duplicates (3-4)
- Medium/tricky cases with varied input sizes (3-4)

RULES:
1. Copy expected_output EXACTLY from problem examples.
2. For your own test cases, hand-trace the algorithm to compute expected_output.
3. Keep inputs small (not stress tests).

Return ONLY valid JSON, NO markdown:
{
  "test_cases": [
    { "id": 1, "description": "brief description", "input": "value(s)", "expected_output": "output" },
    ...
  ]
}`;

  const tcUserPrompt = `Problem:\n${problem}${outputFormat ? `\n\nFunction Signature:\n${outputFormat}` : ""}${userLogic ? `\n\nHint:\n${userLogic}` : ""}`;

  let llmText = await callLLM(tcSysPrompt, tcUserPrompt, KEYS, 2000);
  if (!llmText) return null;

  let testCases;
  try {
    const parsed = parseJSON(llmText);
    testCases = parsed.test_cases || [];
  } catch (e) {
    console.error("Agent 1 JSON parse error:", e);
    const retryPrompt = `Your previous response was not valid JSON. Error: ${e.message}\nPlease return ONLY valid JSON with the test_cases array.\n\nOriginal problem:\n${problem}`;
    const retryText = await callLLM(tcSysPrompt, retryPrompt, KEYS, 3000);
    if (!retryText) return null;
    try {
      const parsed = parseJSON(retryText);
      testCases = parsed.test_cases || [];
    } catch {
      return null;
    }
  }

  if (testCases.length === 0) return null;

  // ── Step 2: Generate a simple reference/brute-force solution to verify ────
  setStatus(
    "● AGENT 1: Generating reference solution to verify test cases…",
    "var(--green)",
  );

  const refSysPrompt = `You are an expert competitive programmer.
Write a simple, CORRECT (not necessarily optimal) brute-force solution in ${codeLangName} for the given problem.

PRIORITY: CORRECTNESS over speed. Use the simplest, most straightforward approach even if it's O(N²) or O(N³).
The solution must handle all edge cases correctly.

The code MUST:
1. Include a main() that runs ALL provided test cases
2. For each test case, print ONLY this exact line:
   VERIFIED|<test_id>|<actual_output>
3. ${selectedLang === "java" ? "Do NOT use 'public' for class definitions. The outer class MUST be 'class Main'." : ""}

IMPORTANT — TEST CASE CODING RULES:
- HARDCODE all test inputs as LITERAL VALUES directly in the code (e.g., vector<int> arr = {1, 2, 3};).
- Do NOT read from stdin. Do NOT parse strings with stoi/stol/atoi/parseInt/sscanf.
- Simply call the function with the literal values and print the VERIFIED line with the result.

Return ONLY valid JSON (no markdown):
{
  "code": "complete runnable code with main..."
}`;

  const testInputStr = testCases
    .map((tc) => `  Test ${tc.id}: Input: ${tc.input}`)
    .join("\n");

  const refUserPrompt = `Problem:\n${problem}${outputFormat ? `\n\nFunction Signature:\n${outputFormat}` : ""}\n\nTest inputs to run:\n${testInputStr}`;

  const refText = await callLLM(refSysPrompt, refUserPrompt, KEYS, 4000);

  if (!refText) {
    // If reference generation fails, return test cases as-is (LLM-computed expected outputs)
    console.warn("Agent 1: Reference solution generation failed, using LLM-computed expected outputs.");
    return testCases;
  }

  let refCode;
  try {
    const parsed = parseJSON(refText);
    refCode = parsed.code || "";
  } catch {
    console.warn("Agent 1: Reference solution JSON parse failed.");
    return testCases;
  }

  if (!refCode) return testCases;

  // ── Step 3: Run reference solution on RapidAPI ────────────────────────────
  setStatus("● AGENT 1: Running reference solution to verify outputs…", "rgba(120,200,255,0.8)");

  // Helper: run code and try to parse VERIFIED lines from stdout
  async function tryVerify(code) {
    const result = await runOnRapidAPI(code, selectedLang, rapidApiKey);
    const stdout = result.stdout || "";
    const verified = {};
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("VERIFIED|")) {
        const parts = trimmed.split("|");
        if (parts.length >= 3) {
          verified[parts[1]] = parts.slice(2).join("|");
        }
      }
    }
    return { result, verified, stdout };
  }

  // ── Attempt 1: Run original reference solution ──
  let verifiedOutputs = {};
  let lastExecRes = null;
  let lastStdout = "";

  try {
    const { result, verified, stdout } = await tryVerify(refCode);
    lastExecRes = result;
    lastStdout = stdout;
    verifiedOutputs = verified;

    if (Object.keys(verified).length === 0) {
      const errDetail = result.exception || result.stderr || result.error || "";
      console.warn("Agent 1: Attempt 1 — 0 verified.", errDetail ? `Error: ${errDetail}` : `Stdout: ${stdout.substring(0, 300)}`);
      setActiveAPI("Ref solution: 0 verified — retrying…", "rgba(255, 200, 100, 0.8)");
    }
  } catch (e) {
    console.warn("Agent 1: Reference execution failed:", e.message);
    setActiveAPI(`Ref exec failed: ${e.message}`, "rgba(255, 100, 100, 0.8)");
  }

  // ── Attempt 2: If 0 verified, ask LLM to fix with detailed error context ──
  if (Object.keys(verifiedOutputs).length === 0) {
    setStatus("● AGENT 1: Fixing reference solution (attempt 2)…", "rgba(255,200,100,0.8)");

    const errDetail = lastExecRes
      ? (lastExecRes.exception || lastExecRes.stderr || lastExecRes.error || `status: ${lastExecRes.status}`)
      : "execution threw an exception";

    const fixPrompt = `The reference solution failed to produce any VERIFIED|id|output lines.

Error/stderr: ${errDetail}
Stdout: ${lastStdout.substring(0, 500) || "empty"}

COMMON ISSUES TO FIX:
1. Print format MUST be exactly: VERIFIED|<id>|<output>  (no spaces around |)
2. For arrays/lists, print them as comma-separated: VERIFIED|1|1,2,3
3. For booleans, print lowercase: VERIFIED|1|true
4. Make sure main() actually calls the function and prints for ALL test IDs: ${testCases.map(tc => tc.id).join(", ")}
5. Do NOT read from stdin — HARDCODE all inputs as literals.
6. ${selectedLang === "java" ? "Class MUST be 'class Main' (no 'public')." : ""}
7. Do NOT use exit(1) or System.exit(1) — always return 0 from main.

Original problem:\n${problem}
${outputFormat ? `\nFunction Signature:\n${outputFormat}` : ""}

Test inputs:\n${testInputStr}

Return ONLY valid JSON: { "code": "complete fixed code..." }`;

    const fixText = await callLLM(refSysPrompt, fixPrompt, KEYS, 4000);
    if (fixText) {
      try {
        const fixParsed = parseJSON(fixText);
        const fixedCode = fixParsed.code || "";
        if (fixedCode) {
          const fix2 = await tryVerify(fixedCode);
          if (Object.keys(fix2.verified).length > 0) {
            verifiedOutputs = fix2.verified;
            setActiveAPI(`Ref fix succeeded: ${Object.keys(fix2.verified).length} verified`, "rgba(100, 220, 180, 0.8)");
          } else {
            console.warn("Agent 1: Attempt 2 still 0 verified. Stdout:", fix2.stdout.substring(0, 300));
            setActiveAPI("Ref fix: still 0 verified", "rgba(255, 100, 100, 0.8)");
          }
        }
      } catch (e) {
        console.warn("Agent 1: Reference fix attempt 2 failed:", e.message);
      }
    }
  }

  // ── Attempt 3: If still 0, try one more time with completely fresh generation ──
  if (Object.keys(verifiedOutputs).length === 0) {
    setStatus("● AGENT 1: Regenerating reference solution (attempt 3)…", "rgba(255,200,100,0.8)");

    const freshPrompt = `Write a SIMPLE brute-force solution in ${codeLangName} for this problem. CORRECTNESS is the only priority.

The code must print exactly this for each test case (no extra output):
VERIFIED|<test_id>|<result>

CRITICAL RULES:
- HARDCODE all inputs as literal values (arrays, numbers, strings) — NO stdin, NO parsing
- Print VERIFIED|id|output for EVERY test id
- Return 0 from main, never call exit(1)
- ${selectedLang === "java" ? "Use 'class Main' (no 'public' keyword)" : ""}

Problem:\n${problem}
${outputFormat ? `\nFunction Signature:\n${outputFormat}` : ""}

Test cases to run:\n${testCases.map(tc => `  Test ${tc.id}: Input: ${tc.input}, Expected: ${tc.expected_output}`).join("\n")}

Return ONLY valid JSON: { "code": "..." }`;

    const freshText = await callLLM(refSysPrompt, freshPrompt, KEYS, 4000);
    if (freshText) {
      try {
        const freshParsed = parseJSON(freshText);
        const freshCode = freshParsed.code || "";
        if (freshCode) {
          const { verified, stdout } = await tryVerify(freshCode);
          if (Object.keys(verified).length > 0) {
            verifiedOutputs = verified;
            setActiveAPI(`Fresh ref: ${Object.keys(verified).length} verified`, "rgba(100, 220, 180, 0.8)");
          } else {
            console.warn("Agent 1: Attempt 3 still 0 verified. Stdout:", stdout.substring(0, 300));
          }
        }
      } catch (e) {
        console.warn("Agent 1: Attempt 3 failed:", e.message);
      }
    }
  }

  // ── If still nothing verified, return LLM-guessed outputs ──
  if (Object.keys(verifiedOutputs).length === 0) {
    setActiveAPI("Verification failed — using LLM outputs", "rgba(255, 100, 100, 0.7)");
    console.warn("Agent 1: All 3 verification attempts failed, using LLM-computed expected outputs.");
    return testCases;
  }

  // ── Update test cases with verified outputs ──
  let verifiedCount = 0;
  const verifiedTestCases = testCases.map((tc) => {
    const verifiedOutput = verifiedOutputs[String(tc.id)];
    if (verifiedOutput !== undefined) {
      verifiedCount++;
      return { ...tc, expected_output: verifiedOutput, verified: true };
    }
    return tc;
  });

  setStatus(
    `● AGENT 1: Verified ${verifiedCount}/${testCases.length} test cases via execution ✓`,
    "var(--green)",
  );
  setActiveAPI(`Verified ${verifiedCount}/${testCases.length} test outputs`, "rgba(100, 220, 180, 0.8)");

  return verifiedTestCases;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT 2 — Code Generator
// Receives test cases + problem, generates code that satisfies all test cases.
// Can be called multiple times with feedback from Agent 3.
// ═══════════════════════════════════════════════════════════════════════════════
async function agentCodeGenerator(
  problem,
  outputFormat,
  userLogic,
  testCases,
  selectedLang,
  codeLangName,
  feedback,
  KEYS,
  previousCode = "",
  attemptNumber = 1,
) {
  const testCaseStr = testCases
    .map(
      (tc) =>
        `  Test ${tc.id}: ${tc.description}\n    Input: ${tc.input}\n    Expected: ${tc.expected_output}`,
    )
    .join("\n");

  const sysPrompt = `You are an expert competitive programmer who specializes in writing the most time-efficient solutions.
Your task is to write a complete, runnable solution in ${codeLangName} ("${selectedLang}").

OPTIMIZATION PRIORITY (THIS IS THE MOST IMPORTANT REQUIREMENT):
- You MUST use the BEST KNOWN algorithm with the LOWEST possible time complexity. This is non-negotiable.
- NEVER use brute force if a better approach exists. NEVER use O(N²) if O(N log N) or O(N) is possible.
- Before writing code, first identify the optimal algorithmic approach:
  * Sorting/Searching → Use binary search O(log N) instead of linear scan O(N)
  * Subarray/Substring problems → Sliding window or two pointers O(N) instead of nested loops O(N²)
  * Range queries → Prefix sums O(1) per query, Segment tree/BIT O(log N) per query instead of brute force O(N)
  * Counting inversions / merge-related → Merge sort based O(N log N) instead of nested comparison O(N²)
  * Shortest path → Dijkstra O(E log V) or BFS O(V+E) instead of Bellman-Ford O(VE)
  * Frequency / lookup → Hash maps O(1) instead of nested loops O(N²)
  * String matching → KMP / Z-algorithm / Rabin-Karp O(N) instead of naive O(N*M)
  * DP → Identify and use the optimal state transition; use space optimization if possible
  * Graph → BFS/DFS/Union-Find/Topological sort as appropriate
  * Greedy → If a greedy proof exists, use it for O(N) or O(N log N)
- Minimize SPACE complexity too: prefer O(1) or O(N) over O(N²). Use in-place algorithms when possible.

CRITICAL INSTRUCTIONS:
1. If the user provides an "OUTPUT FORMAT" (like "class Solution { public: ... }"), YOU MUST USE EXACTLY THAT CLASS AND METHOD SIGNATURE. Do NOT rename the class or method.
2. For Java: do NOT use 'public' for class definitions. The outer class MUST be named 'Main' (e.g., 'class Main { ... }'). You may define inner classes like Solution inside Main.
3. You must generate TWO versions of your code:
   a) "code": A complete runnable program with a main() that tests ALL provided test cases. For EACH test, print a result line. Include all necessary headers/imports.
   b) "final_submission": ONLY the exact class/function the user requested, WITHOUT main(), tests, or imports.

IMPORTANT — TEST CASE CODING RULES:
- HARDCODE all test inputs and expected outputs as LITERAL VALUES directly in the code (e.g., vector<int> arr = {1, 2, 3};).
- Do NOT read from stdin. Do NOT parse strings with stoi/stol/atoi/parseInt/sscanf.
- Do NOT use string parsing or tokenizing to construct test data.
- For EACH test case, call the function with the literal values and print the result in this EXACT format:
  PASS <id>  — if the result matches expected
  FAIL <id> expected:<expected> got:<actual>  — if it doesn't match
- ALWAYS exit normally with exit code 0, even if tests fail. Do NOT call exit(1), System.exit(1), process.exit(1), or os.Exit(1). Just print PASS/FAIL and let main() return 0.

Example for C++:
  int main() {
    bool ok = true;
    auto r1 = myFunc({1,2,3});
    if (r1 == 5) cout << "PASS 1" << endl;
    else { cout << "FAIL 1 expected:5 got:" << r1 << endl; ok = false; }
    // ... more tests ...
    return 0;  // ALWAYS return 0
  }

Example for Python:
  r1 = my_func([1,2,3])
  if r1 == 5: print("PASS 1")
  else: print(f"FAIL 1 expected:5 got:{r1}")
  # ... more tests ... NO sys.exit()!

Return your response ONLY as valid JSON in this exact format, with NO markdown formatting:
{
  "language": "${selectedLang}",
  "code": "complete runnable code with main and asserts...",
  "final_submission": "only the class/function..."
}`;

  let userPrompt = `Problem:\n${problem}`;
  if (outputFormat) userPrompt += `\n\nOUTPUT FORMAT:\n${outputFormat}`;
  if (userLogic) userPrompt += `\n\nLOGIC HINT:\n${userLogic}`;
  userPrompt += `\n\nTEST CASES (you must test ALL of these):\n${testCaseStr}`;

  if (feedback) {
    userPrompt += `\n\n--- FEEDBACK FROM VALIDATOR (Attempt #${attemptNumber}) ---\n${feedback}`;
    if (previousCode) {
      userPrompt += `\n\n--- YOUR PREVIOUS CODE THAT FAILED ---\n${previousCode}`;
    }
    userPrompt += `\n\nYour previous solution produced WRONG outputs. You MUST use a DIFFERENT algorithm or approach. Do NOT regenerate the same code. Analyze why the "got" values differ from "expected" and fix the core logic.`;
  }

  // Increase temperature on retries to force different approaches
  const temp = attemptNumber > 1 ? Math.min(0.3 + attemptNumber * 0.1, 0.8) : 0.1;
  const llmText = await callLLM(sysPrompt, userPrompt, KEYS, 4000, temp);
  if (!llmText) return null;

  try {
    return parseJSON(llmText);
  } catch (e) {
    console.error("Agent 2 JSON parse error:", e);
    // Retry once
    const retryPrompt = `Your previous response was not valid JSON. Error: ${e.message}\nPlease fix and return ONLY valid JSON.\n\nYour response was:\n${llmText}`;
    const retryText = await callLLM(sysPrompt, retryPrompt, KEYS, 4000);
    if (!retryText) return null;
    try {
      return parseJSON(retryText);
    } catch {
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT 3 — Code Executor & Validator
// Runs code, parses PASS/FAIL lines from stdout.
//   - All PASS → success
//   - Any FAIL → sends detailed "expected X got Y" feedback to Agent 2
//   - Compile/runtime errors → sends error details to Agent 2
// ═══════════════════════════════════════════════════════════════════════════════
async function agentCodeExecutorValidator(
  codeResult,
  problem,
  outputFormat,
  userLogic,
  testCases,
  selectedLang,
  codeLangName,
  KEYS,
  answerEl,
  maxIterations = 6,
) {
  const rapidApiKey = KEYS.rapidKey || "";
  let currentCode = codeResult;
  let iteration = 1;

  while (iteration <= maxIterations) {
    const runnableCode = currentCode.code || "";
    const finalSubmission = currentCode.final_submission || runnableCode;

    setStatus(
      `● AGENT 3: Executing code (Iteration ${iteration}/${maxIterations})…`,
      "rgba(120,200,255,0.8)",
    );

    answerEl.textContent =
      `Running ${selectedLang} code… (Iteration ${iteration})\n\n` +
      runnableCode.substring(0, 120) +
      "...";

    let execRes;
    try {
      execRes = await runOnRapidAPI(runnableCode, selectedLang, rapidApiKey);
    } catch (e) {
      return {
        success: false,
        error: `API Error: ${e.message}`,
        code: runnableCode,
        finalSubmission,
      };
    }

    const stdout = execRes.stdout || "";
    const stderr = execRes.stderr || "";
    const exception = execRes.exception || "";
    const apiError = execRes.error || "";

    // ── ALWAYS parse PASS/FAIL from stdout first (even on non-zero exit) ──
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    const passLines = lines.filter((l) => l.startsWith("PASS "));
    const failLines = lines.filter((l) => l.startsWith("FAIL "));
    const hasTestOutput = passLines.length > 0 || failLines.length > 0;

    // ── If stdout has PASS/FAIL lines, use them (ignore exit code) ──
    if (hasTestOutput) {
      if (failLines.length === 0) {
        // All tests passed!
        setStatus(`● AGENT 3: All ${passLines.length} tests passed!`, "var(--green)");
        return { success: true, code: runnableCode, finalSubmission, stdout };
      }

      // Some tests failed — build detailed feedback
      const failSummary = failLines.slice(0, 10).join("\n");
      const passSummary = passLines.length > 0 ? `\nTests that PASSED (${passLines.length}): ${passLines.slice(0, 5).join(", ")}` : "";

      setStatus(`● AGENT 3 → AGENT 2: ${failLines.length} test(s) failed (${iteration}/${maxIterations})…`, "rgba(255,200,100,0.8)");
      answerEl.textContent = `Iteration ${iteration}: ${failLines.length} failed, ${passLines.length} passed\n\n${failSummary}`;

      iteration++;
      if (iteration > maxIterations) break;

      const feedback = `TEST RESULTS: ${passLines.length} passed, ${failLines.length} failed.

FAILED TESTS (with actual vs expected values):
${failSummary}
${passSummary}

IMPORTANT: Look at the "expected" vs "got" values above. Your algorithm is producing wrong results for these inputs.
- Do NOT change the test expectations — fix your ALGORITHM logic.
- Keep the tests that already pass intact.`;

      setStatus(`● AGENT 2: Fixing code (${iteration}/${maxIterations})…`, "var(--green)");
      const newCode = await agentCodeGenerator(problem, outputFormat, userLogic, testCases, selectedLang, codeLangName, feedback, KEYS, runnableCode, iteration);
      if (!newCode) return { success: false, error: "Agent 2 failed to fix code.", code: runnableCode, finalSubmission };
      currentCode = newCode;
      continue;
    }

    // ── No PASS/FAIL lines: check for compilation / runtime errors ──
    if (exception || apiError || execRes.status !== "success") {
      const errStr = apiError || exception || stderr || `Unknown error (status: ${execRes.status})`;

      setStatus(`● AGENT 3 → AGENT 2: Compile/runtime error (${iteration}/${maxIterations})…`, "rgba(255,200,100,0.8)");
      answerEl.textContent = `Iteration ${iteration}: Compile/runtime error\n\n${errStr.substring(0, 400)}`;

      iteration++;
      if (iteration > maxIterations) break;

      const feedback = `COMPILATION OR RUNTIME ERROR:\n${errStr.substring(0, 1500)}\n\nStdout: ${stdout.substring(0, 300) || "empty"}\n\nFix the code so it compiles and runs without errors. Remember: HARDCODE all test values as literals, do NOT use stoi/parseInt/sscanf. ALWAYS return 0 from main.`;

      setStatus(`● AGENT 2: Fixing code (${iteration}/${maxIterations})…`, "var(--green)");
      const newCode = await agentCodeGenerator(problem, outputFormat, userLogic, testCases, selectedLang, codeLangName, feedback, KEYS, runnableCode, iteration);
      if (!newCode) return { success: false, error: "Agent 2 failed to fix code.", code: runnableCode, finalSubmission };
      currentCode = newCode;
      continue;
    }

    // ── Code ran with no errors and no PASS/FAIL output — treat as success ──
    setStatus("● AGENT 3: Code ran successfully!", "var(--green)");
    return { success: true, code: runnableCode, finalSubmission, stdout };
  }

  // Max iterations reached
  return {
    success: false,
    error: "Max iterations reached. Could not pass all test cases.",
    code: currentCode.code || "",
    finalSubmission: currentCode.final_submission || currentCode.code || "",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR — executeCodeAgentFlow
// Coordinates all three agents in sequence with iterative feedback loops.
// ═══════════════════════════════════════════════════════════════════════════════
export async function executeCodeAgentFlow(q, ctx, KEYS) {
  const btn = document.getElementById("gen-btn");
  btn.disabled = true;
  const answerEl = document.getElementById("answer");
  const langSelect = document.getElementById("lang-select-custom");
  const selectedLang = langSelect ? (langSelect.getAttribute("data-value") || "cpp") : "cpp";

  const langNames = {
    cpp: "C++",
    python: "Python 3",
    java: "Java",
    javascript: "Node.js (JavaScript)",
    go: "Go",
  };
  const codeLangName = langNames[selectedLang] || "C++";

  // Extract problem parts
  const execCode = document.getElementById("exec-code")?.value.trim() || "";
  const execFormat =
    document.getElementById("exec-output-format")?.value.trim() || "";
  const execLogic = document.getElementById("exec-logic")?.value.trim() || "";

  const problem = execCode || q;

  answerEl.innerHTML =
    '<div class="ld"><span></span><span></span><span></span></div>';

  // ── AGENT 1: Generate & Verify Test Cases ────────────────────────────────
  const testCases = await agentTestCaseGenerator(
    problem,
    execFormat,
    execLogic,
    selectedLang,
    codeLangName,
    KEYS,
  );

  if (!testCases || testCases.length === 0) {
    answerEl.innerHTML = `<span style="color:rgba(255,100,100,0.7)">Agent 1 failed to generate test cases. Please check API Key.</span>`;
    setStatus("● ERROR: Test case generation failed", "rgba(255,100,100,0.8)");
    btn.disabled = false;
    return;
  }

  const verifiedCount = testCases.filter((tc) => tc.verified).length;
  answerEl.textContent = `Agent 1: Generated ${testCases.length} test cases (${verifiedCount} verified by execution).\n\n${testCases.map((tc) => `${tc.verified ? "✓" : "○"} #${tc.id} ${tc.description}`).join("\n")}`;

  // ── AGENT 2: Generate Initial Code ────────────────────────────────────────
  setStatus("● AGENT 2: Generating code…", "var(--green)");

  const initialCode = await agentCodeGenerator(
    problem,
    execFormat,
    execLogic,
    testCases,
    selectedLang,
    codeLangName,
    null, // no feedback on first attempt
    KEYS,
  );

  if (!initialCode) {
    answerEl.innerHTML = `<span style="color:rgba(255,100,100,0.7)">Agent 2 failed to generate code. Please check API Key.</span>`;
    setStatus("● ERROR: Code generation failed", "rgba(255,100,100,0.8)");
    btn.disabled = false;
    return;
  }

  // ── AGENT 3: Execute, Validate & Iterate ──────────────────────────────────
  const result = await agentCodeExecutorValidator(
    initialCode,
    problem,
    execFormat,
    execLogic,
    testCases,
    selectedLang,
    codeLangName,
    KEYS,
    answerEl,
    6, // max iterations for Agent 2 ↔ Agent 3 loop
  );

  if (result.success) {
    answerEl.textContent = result.finalSubmission;
    setStatus("● DONE ✓ (All tests passed)");
    btn.disabled = false;

    // Generate logic analysis
    const isCodeMode = document
      .getElementById("code-mode-container")
      ?.classList.contains("active");
    if (
      isCodeMode &&
      document.getElementById("exec-logic") &&
      !document.getElementById("exec-logic").value.trim()
    ) {
      generateCodeLogic(problem, result.code, KEYS);
    }
    return;
  }

  // Failed after all iterations
  answerEl.textContent = `// Failed after max iterations.\n// Error: ${result.error}\n\n// Last generated code:\n${result.finalSubmission || result.code}`;
  setStatus("● DONE (Failed to resolve)", "rgba(255,100,100,0.8)");
  btn.disabled = false;
}

// ─── Legacy exports (used by renderer.js) ────────────────────────────────────
export async function askForCode(sysPrompt, userPrompt, KEYS) {
  return callLLM(sysPrompt, userPrompt, KEYS, 2000);
}

export async function generateCodeLogic(prompt, code, KEYS) {
  const logicEl = document.getElementById("exec-logic");
  if (!logicEl || (!KEYS.anthropicKey && !KEYS.customLlmBaseUrl && !KEYS.openrouterKey && !KEYS.groqKey)) return;

  logicEl.value = "Analyzing logic and time/space complexity...";

  const sysPrompt = `You are an expert competitive programmer and computer science instructor.
The user will provide a coding problem and the actual passing solution code they just executed.
Your task is to analyze THEIR SPECIFIC CODE and determine the exact algorithmic strategy or data structure they used (e.g., "Two Pointer Approach", "Min-Heap", "Dynamic Programming", "Depth-First Search", etc).
Do not output generic placeholder text. Read their code and explain EXACTLY how that code solves the problem.

Format your response exactly as follows without any markdown formatting wrappers:
Algorithm: <Exact name of the algorithm or technique used>
Description: <A 2-3 sentence explanation of how the provided code logic works>
Time Complexity: <e.g., O(N)>
Space Complexity: <e.g., O(1)>
Optimal: <Yes if this is the best known complexity for this problem, or No with a brief note on what would be better>`;

  const userPrompt = `Problem:\n${prompt}\n\nCode:\n${code}`;

  try {
    const result = await callLLM(sysPrompt, userPrompt, KEYS, 300);
    logicEl.value = result ? result.trim() : "Failed to analyze logic.";
  } catch (e) {
    console.error("Logic Gen Error:", e);
    logicEl.value = "Error analyzing logic.";
  }
}

export async function tavilyAnswer(q, ctx, KEYS) {
  const tavilyKey = KEYS.tavilyKey || "";
  if (!tavilyKey) throw new Error("No Tavily key");

  const query = ctx
    ? `Interview answer: ${q} (candidate: ${ctx})`
    : `Best interview answer for: ${q}`;

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 3,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (
    data.answer || data.results?.[0]?.content || "Could not find an answer."
  );
}

export async function performOCR(base64Data, KEYS) {
  const geminiKey = KEYS.geminiKey || "";
  const groqKey = KEYS.groqKey || "";

  const base64Content = base64Data.includes("base64,")
    ? base64Data.split("base64,")[1]
    : base64Data;
  const fullDataUrl = base64Data.includes("base64,")
    ? base64Data
    : `data:image/png;base64,${base64Data}`;

  // 1. Try Groq Vision
  if (groqKey) {
    const groqModels = [
      "llama-3.2-11b-vision-preview",
      "llama-3.2-90b-vision-preview",
      "meta-llama/llama-4-scout-17b-16e-instruct",
    ];

    for (const modelId of groqModels) {
      try {
        const res = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: modelId,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Extract all text from this image exactly as it appears. No conversational padding or formatting. Just the plain text.",
                    },
                    {
                      type: "image_url",
                      image_url: { url: fullDataUrl },
                    },
                  ],
                },
              ],
              temperature: 0,
            }),
          },
        );

        const data = await res.json();
        if (res.ok && data.choices?.[0]?.message?.content) {
          return data.choices[0].message.content.trim();
        }
        console.warn(
          `Groq OCR with ${modelId} failed:`,
          data.error?.message || "Unknown error",
        );
      } catch (e) {
        console.error(`Groq OCR Error (${modelId}):`, e);
      }
    }
  }

  // 2. Fallback to Gemini
  if (geminiKey) {
    const geminiModels = [
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite-preview-02-05",
    ];

    for (const modelId of geminiModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: "Perform OCR on this image. Extract exactly what is written. Just the text.",
                    },
                    {
                      inline_data: {
                        mime_type: "image/png",
                        data: base64Content,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 1000,
              },
            }),
          },
        );

        const data = await res.json();
        if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return data.candidates[0].content.parts[0].text.trim();
        }
        console.warn(
          `Gemini OCR with ${modelId} failed:`,
          data.error?.message || "Unknown error",
        );
      } catch (e) {
        console.error(`Gemini OCR Error (${modelId}):`, e);
      }
    }
  }

  throw new Error("OCR failed. Vision models not found or API keys invalid.");
}
