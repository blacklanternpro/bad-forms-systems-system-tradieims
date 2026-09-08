import os, json, logging
logger = logging.getLogger("extractor")

FIXTURE = {"kind": "wholesale_receipt", "supplier": "rexel", "docket_number": "RX-88214",
           "total_cents": 21450, "gst_cents": 1950, "receipt_date": None, "confidence": 0.9}

PROMPT = """You are a receipts extractor for an Australian trades business. Look at this photo of a docket/receipt and return ONLY a JSON object (no markdown) with keys:
kind: one of wholesale_receipt|mix_docket|fuel|timesheet_voice|unknown
supplier: one of reece|middys|rexel|other
docket_number: string or null
total_cents: integer total INCLUDING GST in cents, or null
gst_cents: integer GST in cents, or null
receipt_date: YYYY-MM-DD or null
confidence: 0-1"""

async def extract(file_path: str, mime: str = "image/jpeg"):
    if os.environ.get("EXTRACTOR_MODE", "ai") == "fixture":
        return dict(FIXTURE)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        import uuid, base64
        with open(file_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"extract-{uuid.uuid4()}",
                       system_message="You extract structured data from trade receipts. Reply with raw JSON only.").with_model("openai", "gpt-5.4")
        msg = UserMessage(text=PROMPT, file_contents=[ImageContent(image_base64=b64)])
        resp = await chat.send_message(msg)
        text = resp.strip() if isinstance(resp, str) else str(resp)
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        data = json.loads(text)
        for k in FIXTURE:
            data.setdefault(k, None)
        if data.get("kind") not in ("wholesale_receipt", "mix_docket", "fuel", "timesheet_voice", "unknown"):
            data["kind"] = "unknown"
        if data.get("supplier") not in ("reece", "middys", "rexel", "other"):
            data["supplier"] = "other"
        return data
    except Exception as e:
        logger.error(f"extraction failed: {e}")
        return {"error": str(e)}

VOICE_FIXTURE = {"transcript": "Tommo on the treeton job, on at seven, off at three thirty, ran the new circuit.",
                 "ts_start": "07:00", "ts_end": "15:30", "note": "ran the new circuit"}

PARSE_PROMPT = """This is a transcript of an Australian tradie's spoken voice timesheet. Return ONLY a JSON object (no markdown) with keys:
ts_start: start time as 24h "HH:MM" or null if not mentioned
ts_end: finish time as 24h "HH:MM" or null if not mentioned
note: a short (<=10 word) summary of any work described, or null
Trades work daytime: "seven" means 07:00, "three thirty" means 15:30.
Transcript: """

async def transcribe_voice(file_path: str):
    if os.environ.get("EXTRACTOR_MODE", "ai") == "fixture":
        return dict(VOICE_FIXTURE)
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        import uuid
        stt = OpenAISpeechToText(api_key=os.environ["EMERGENT_LLM_KEY"])
        with open(file_path, "rb") as f:
            resp = await stt.transcribe(file=f, model="whisper-1", response_format="json", language="en",
                                        prompt="Tradie voice timesheet: start time, finish time, job notes.")
        transcript = (getattr(resp, "text", "") or "").strip()
        out = {"transcript": transcript, "ts_start": None, "ts_end": None, "note": None}
        if transcript:
            chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"ts-{uuid.uuid4()}",
                           system_message="You parse tradie timesheets. Reply with raw JSON only.").with_model("openai", "gpt-5.4")
            r = await chat.send_message(UserMessage(text=PARSE_PROMPT + transcript))
            text = r.strip() if isinstance(r, str) else str(r)
            if text.startswith("```"):
                text = text.split("```")[1].lstrip("json").strip()
            try:
                parsed = json.loads(text)
                for k in ("ts_start", "ts_end", "note"):
                    v = parsed.get(k)
                    out[k] = v if isinstance(v, str) and v else None
            except json.JSONDecodeError:
                pass
        return out
    except Exception as e:
        logger.error(f"voice transcription failed: {e}")
        return {"error": str(e)}
