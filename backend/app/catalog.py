"""Subjects and the fields each subject asks for (docs/TOP-50-SUBJECTS-UA.md).

The one source for:
- the teacher wizard (step 2) and the learner's search and request forms (sent by GET /api/meta),
- the search: matching.py compares the learner's answers with the teacher's,
- readable text for profiles, requests and chats.

Every field is a pair: the teacher describes themselves, the learner says whom they look for.
Both pick from the same options, so the answers can be compared. `match` says how:

- "in":      the teacher picks several values, the learner one; the learner's value must be among the teacher's.
- "min":     the teacher picks one value on a scale, the learner a minimum; the teacher's must be at least that.
- "has":     the teacher has something (a checkbox, or some of the options); the learner can require it.
- "overlap": both pick several values (topics); more in common gives a higher match %.
- "info":    only the learner answers, in the request (exam date, instrument at home). Not a filter.

`strict` fields hide teachers who don't fit; the others only change the match %. A learner who leaves
a field empty ("Any") is not filtered by it. Values are stored as option keys, never as labels.
"""
import re
from dataclasses import dataclass, field

MATCHES = ("in", "min", "has", "overlap", "info")


def slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def opts(*items) -> tuple[dict, ...]:
    """Options from labels ("Speaking" -> key "speaking") or (key, label) / (key, label, extra) tuples."""
    out = []
    for item in items:
        if isinstance(item, str):
            out.append({"key": slug(item), "label": item})
        else:
            key, label, *extra = item
            out.append({"key": key, "label": label, **(extra[0] if extra else {})})
    return tuple(out)


def scale(*items) -> tuple[dict, ...]:
    """Ordered options for "min" fields: (key, label, rank)."""
    return tuple({"key": k, "label": label, "n": n} for k, label, n in items)


@dataclass(frozen=True)
class Field:
    key: str
    match: str
    teacher: str | None = None  # label in the wizard; None: only the learner answers
    learner: str | None = None  # label in the learner's forms; None: only the teacher answers
    options: tuple[dict, ...] = ()
    learner_options: tuple[dict, ...] | None = None  # "min": the thresholds a learner can pick
    strict: bool = False
    required: bool = False  # the teacher must answer before submitting the profile
    learner_required: bool = False  # the learner must answer before searching (level has a "Not sure" choice)
    when: tuple[str, str] | None = None  # shown only when field when[0] has the value when[1]
    against: str | None = None  # compare with this teacher field instead of `key`
    request: bool | None = None  # asked in the request form (default: in/overlap/info)
    section: str | None = None  # sub-heading in the forms ("NMT preparation")
    cap: str | None = None  # the teacher's values can't rank above this field's value (own level)
    tags: bool = False  # shown as tags on the teacher card
    hint: str | None = None  # helper text in the wizard
    short: str | None = None  # label on the teacher's public page (default: `teacher` without "Your")

    @property
    def in_request(self) -> bool:
        if self.learner is None:
            return False
        return self.request if self.request is not None else self.match in ("in", "overlap", "info")

    def learner_choices(self) -> tuple[dict, ...]:
        return self.learner_options if self.learner_options is not None else self.options

    def to_dict(self) -> dict:
        data = {
            "key": self.key, "match": self.match, "teacher": self.teacher, "learner": self.learner,
            "options": list(self.options), "strict": self.strict, "required": self.required,
            "learner_required": self.learner_required, "request": self.in_request,
        }  # fmt: skip
        if self.learner_options is not None:
            data["learner_options"] = list(self.learner_options)
        for name in ("when", "against", "section", "cap", "hint", "short"):
            if getattr(self, name):
                data[name] = list(self.when) if name == "when" else getattr(self, name)
        if self.tags:
            data["tags"] = True
        return data


@dataclass(frozen=True)
class Subject:
    name: str
    category: str
    fields: tuple[Field, ...]
    aliases: tuple[str, ...] = ()
    kids_only: bool = False  # lessons for children only: the learner form skips "Myself"
    by: dict = field(default_factory=dict, compare=False, repr=False)

    def __post_init__(self):
        self.by.update({f.key: f for f in self.fields})

    def to_dict(self) -> dict:
        return {
            "name": self.name, "category": self.category, "aliases": list(self.aliases),
            "kids_only": self.kids_only, "fields": [f.to_dict() for f in self.fields],
        }  # fmt: skip


# ---------- Shared option lists and fields ----------

AGES = opts(
    ("preschool", "Preschool 3–5", {"min_age": 3, "max_age": 5}),
    ("kids", "Kids 6–12", {"min_age": 6, "max_age": 12}),
    ("teens", "Teens 13–17", {"min_age": 13, "max_age": 17}),
    ("adults", "Adults 18+", {"min_age": 18, "max_age": 120}),
)
AGES_6 = AGES[1:]  # from 6 years
AGES_13 = AGES[2:]  # teens and adults


def age(options=AGES) -> Field:
    return Field("age", "in", "Age groups", "Age", options, strict=True, required=True)


def level(options, teacher="Student levels", learner="Level", strict=True, cap=None) -> Field:
    return Field("level", "in", teacher, learner, options, strict=strict, required=True, learner_required=True, cap=cap)


def goals(*items) -> Field:
    return Field("goal", "in", "Learning goals", "Goal", opts(*items), required=True, learner_required=True)


def topics(*items, teacher="Topics", learner="Topics") -> Field:
    return Field("topics", "overlap", teacher, learner, opts(*items), required=True, tags=True)


def years(key, teacher, learner, **kw) -> Field:
    options = scale(("1", "1+ years", 1), ("3", "3+ years", 3), ("5", "5+ years", 5), ("10", "10+ years", 10))
    return Field(key, "min", teacher, learner, options, strict=True, **kw)


SKILL = opts("Complete beginner", "Beginner", "Intermediate", "Advanced")

CEFR = scale(
    ("A1", "Beginner (A1)", 1), ("A2", "Elementary (A2)", 2), ("B1", "Intermediate (B1)", 3),
    ("B2", "Upper-intermediate (B2)", 4), ("C1", "Advanced (C1)", 5), ("C2", "Proficient (C2)", 6),
)  # fmt: skip
OWN_CEFR = CEFR + scale(("native", "Native speaker", 7))
MIN_CEFR = scale(("B2", "B2 or higher", 4), ("C1", "C1 or higher", 5), ("C2", "C2 or higher", 6), ("native", "Native speaker", 7))

NMT_SECTION = "NMT preparation"


def nmt_fields() -> tuple[Field, ...]:
    """Shown when "NMT" is among the goals: NMT is a goal inside a subject, not a subject."""
    when = ("goal", "nmt")
    kw = {"when": when, "section": NMT_SECTION}
    return (
        Field("nmt_best", "min", "Best NMT score of your students", "Target NMT score",
              scale(("none", "No results yet", 0), ("160", "160+", 160), ("170", "170+", 170), ("180", "180+", 180),
                    ("190", "190+", 190), ("200", "200", 200)),
              learner_options=scale(("160", "160+", 160), ("170", "170+", 170), ("180", "180+", 180), ("190", "190+", 190), ("200", "200", 200)),
              strict=True, request=True, required=True, **kw,
              hint="Your students' best result in this subject. Upload screenshots of results (names hidden) as certificates to get it verified."),
        Field("nmt_start", "in", "Students you prepare", "Current level",
              opts(("zero", "From scratch (no mock test or under 140)"), ("mid", "Average (mock test 140–169)"), ("strong", "Strong (mock test 170+)")),
              strict=True, required=True, **kw),
        Field("nmt_own", "min", "Your own NMT / ZNO score", "Teacher's own score",
              scale(("150", "150–169", 150), ("170", "170–179", 170), ("180", "180–189", 180), ("190", "190–199", 190), ("200", "200", 200)),
              learner_options=scale(("170", "170+", 170), ("180", "180+", 180), ("190", "190+", 190), ("200", "200", 200)),
              strict=True, **kw),
        years("nmt_years", "Years preparing for NMT / ZNO", "Teacher's NMT experience", **kw),
        Field("nmt_format", "overlap", "Preparation formats", "Preparation format",
              opts("Full course (6–9 months)", "Intensive (1–3 months)", "Mock tests with review", "Separate topics", "Subject choice and admission advice"), **kw),
        Field("nmt_year", "info", None, "Exam year", opts("2027", "2028", "2029"), **kw),
    )  # fmt: skip


# ---------- Languages ----------

LANG_TOPICS = (
    "Speaking", "Grammar", "Pronunciation", "Vocabulary", "Writing", "Listening", "Reading",
    "Business language", "Language for your job",
)  # fmt: skip


def language(
    name, exams, nmt=False, levels=CEFR, own=OWN_CEFR, min_own=MIN_CEFR, teaching=None, extra=(), aliases=()
) -> Subject:
    teaching = teaching or ("Philology or teaching degree", "Language teaching course")
    goal_items = [
        ("conversation", "Everyday conversation"), ("work", "Work"), ("interviews", "Job interviews"),
        ("exam", "Exam or certificate"), ("school", "School support"), ("study_abroad", "Study abroad"),
        ("relocation", "Relocation and integration"), ("travel", "Travel"), ("hobby", "Hobby"),
    ]  # fmt: skip
    if nmt:
        goal_items.insert(4, ("nmt", "NMT"))
    fields = [
        Field("own_level", "min", f"Your {name} level", "Teacher's level", own,
              learner_options=min_own, strict=True, required=True,
              hint="You can teach up to your own level."),
        level(levels, cap="own_level"),
        age(),
        goals(*goal_items),
        topics(*LANG_TOPICS),
        Field("explain", "in", "You explain in", "Explanations",
              opts(("native", "Ukrainian or the learner's language"), ("target", f"Only {name} (immersion)")), short="Explains in"),
        Field("teaching_cert", "has", "Teaching qualification", "Only teachers with a teaching qualification",
              opts(*teaching), strict=True),
        Field("lang_cert", "has", f"Your {name} certificates" if exams else f"I have a {name} language certificate",
              "Only teachers with a language certificate", opts(*exams) if exams else (), strict=True,
              short=f"{name} language certificate"),
        *extra,
    ]  # fmt: skip
    if exams:
        fields.append(Field("exams", "in", "Exams you prepare for", "Exam", opts(*exams), strict=True,
                            required=True, when=("goal", "exam"), section="Exam preparation"))  # fmt: skip
    if nmt:
        fields += nmt_fields()
    return Subject(name, "Languages", tuple(fields), aliases=aliases)


ENGLISH_EXAMS = ("IELTS", "TOEFL iBT", "Cambridge B2 First", "Cambridge C1 Advanced", "Cambridge C2 Proficiency", "PTE", "Duolingo English Test")
HSK = scale(*[(f"hsk{i}", f"HSK {i}", i) for i in range(1, 7)])

LANGUAGES = [
    language("English", ENGLISH_EXAMS, nmt=True,
             teaching=("Philology or teaching degree", "CELTA", "DELTA", "TKT", "TEFL / TESOL"),
             extra=(Field("accent", "in", "Accents you teach", "Accent", opts(("british", "British"), ("american", "American"))),),
             aliases=("англійська", "англійська мова", "english language")),
    language("German", ("Goethe-Zertifikat", "telc", "TestDaF", "DSH", "ÖSD", "DTZ (integration test)", "Leben in Deutschland"),
             nmt=True, aliases=("німецька", "deutsch")),
    language("Polish", ("Polish state certificate (B1–C2)", "B1 exam for citizenship or residence"), aliases=("польська", "polski")),
    language("French", ("DELF", "DALF", "TCF", "TEF Canada"), nmt=True, aliases=("французька", "français")),
    language("Spanish", ("DELE", "SIELE"), nmt=True,
             extra=(Field("variant", "in", "Variants you teach", "Variant", opts(("spain", "Spain"), ("latam", "Latin America"))),),
             aliases=("іспанська", "español")),
    language("Czech", ("CCE", "Exam for permanent residence", "B1 exam for citizenship"), aliases=("чеська", "čeština")),
    language("Slovak", (), aliases=("словацька", "slovenčina")),
    language("Italian", ("CILS", "CELI", "PLIDA"), aliases=("італійська", "italiano")),
    language("Dutch", ("NT2 Staatsexamen", "CNaVT", "Inburgeringsexamen"), aliases=("нідерландська", "голландська", "nederlands")),
    language("Chinese", ("HSK", "HSKK"), levels=HSK, own=HSK + scale(("native", "Native speaker", 7)),
             min_own=scale(("hsk5", "HSK 5 or higher", 5), ("hsk6", "HSK 6 or higher", 6), ("native", "Native speaker", 7)),
             extra=(Field("script", "in", "Characters you teach", "Characters",
                          opts(("simplified", "Simplified"), ("traditional", "Traditional")), strict=True),),
             aliases=("китайська", "mandarin", "中文")),
    Subject("Business English", "Languages", (
        Field("own_level", "min", "Your English level", "Teacher's level", OWN_CEFR,
              learner_options=MIN_CEFR, strict=True, required=True, hint="You can teach up to your own level."),
        level(CEFR[1:], cap="own_level"),
        age(AGES_13),
        goals(("work", "Work"), ("interviews", "Job interviews"), ("meetings", "Meetings and negotiations"),
              ("international", "Moving to an international company"), ("promotion", "Promotion")),
        topics("Emails", "Negotiations", "Presentations", "Job interviews", "Calls and meetings", "Small talk", "Reports"),
        Field("industry", "overlap", "Industries you know", "Your industry",
              opts("IT", "Finance and banking", "Marketing and sales", "Medicine and pharma", "Law", "Logistics",
                   "HR", "Engineering", "Tourism")),
        Field("industry_exp", "has", "I have worked in an international company or in these industries",
              "Only teachers with industry experience", strict=True, short="Worked in an international company"),
        Field("teaching_cert", "has", "Teaching qualification", "Only teachers with a teaching qualification",
              opts("Philology or teaching degree", "CELTA", "DELTA", "TKT", "TEFL / TESOL"), strict=True),
    ), aliases=("бізнес англійська", "ділова англійська")),  # fmt: skip
    Subject("IELTS", "Languages", (
        level(scale(("b45", "Under 5.0", 4.5), ("b50", "5.0–5.5", 5), ("b60", "6.0–6.5", 6), ("b70", "7.0+", 7)),
              teacher="Students' current band", learner="Current band"),
        age(AGES_13),
        goals(("study_abroad", "Study abroad"), ("work_abroad", "Work abroad"), ("migration", "Migration"),
              ("registration", "Professional registration")),
        topics("Listening", "Reading", "Writing", "Speaking", teacher="Exam parts", learner="Parts to improve"),
        Field("module", "in", "Modules you prepare for", "Module",
              opts(("academic", "Academic"), ("general", "General Training")), strict=True, required=True),
        Field("own_band", "min", "Your IELTS band", "Teacher's band",
              scale(("b65", "6.5", 6.5), ("b70", "7.0", 7), ("b75", "7.5", 7.5), ("b80", "8.0", 8), ("b85", "8.5", 8.5), ("b90", "9.0", 9)),
              learner_options=scale(("b70", "7.0+", 7), ("b75", "7.5+", 7.5), ("b80", "8.0+", 8), ("b85", "8.5+", 8.5)),
              strict=True, required=True),
        Field("target_band", "min", None, "Target band",
              scale(("b55", "5.5", 5.5), ("b60", "6.0", 6), ("b65", "6.5", 6.5), ("b70", "7.0", 7), ("b75", "7.5", 7.5), ("b80", "8.0", 8), ("b85", "8.5", 8.5)),
              against="own_band", request=True),
        Field("teaching_cert", "has", "Teaching qualification", "Only teachers with a teaching qualification",
              opts("Philology or teaching degree", "CELTA", "DELTA", "TKT", "TEFL / TESOL"), strict=True),
        Field("exam_date", "info", None, "Exam date",
              opts("Within a month", "In 1–3 months", "In 3–6 months", "Not booked yet")),
    ), aliases=("айелтс", "ielts academic", "ielts general")),  # fmt: skip
]


# ---------- School ----------

GRADES = scale(*[(f"g{i}", f"Grade {i}", i) for i in range(1, 12)], ("graduate", "Graduate (past years)", 12))
SCHOOL_EXP = scale(
    ("school", "Works or worked at a school", 1), ("cat2", "Category II", 2), ("cat1", "Category I", 3),
    ("higher", "Higher category", 4), ("methodist", "Senior teacher or teacher-methodist", 5),
)  # fmt: skip
OLYMPIAD = scale(("district", "District stage", 1), ("regional", "Regional stage", 2), ("national", "National stage", 3), ("international", "International", 4))
CURRICULA = opts(("ua", "Ukrainian"), ("uk", "British (GCSE, A-level)"), ("ib", "IB"), ("pl", "Polish"), ("de", "German"), ("other", "Other"))


def school(name, topic_items, nmt=True, grades=GRADES, extra_goals=(), aliases=()) -> Subject:
    goal_items = [
        ("grades", "Better marks"), ("catch_up", "Catch up on missed topics"), ("tests", "Tests and state exams (DPA)"),
        ("olympiad", "Olympiads and MAN"), ("lyceum", "Lyceum entrance"), ("ua_abroad", "Ukrainian school from abroad"),
        ("adapt_abroad", "Adapting to a school abroad"), *extra_goals,
    ]  # fmt: skip
    if nmt:
        goal_items.insert(3, ("nmt", "NMT"))
    fields = [
        level(grades, teacher="Grades you teach", learner="Grade"),
        goals(*goal_items),
        topics(*topic_items),
        Field("program", "in", "Programme levels", "Programme level",
              opts(("standard", "Standard"), ("advanced", "Advanced (specialised school)"), ("olympiad", "Olympiad")),
              strict=True, required=True),
        Field("curriculum", "in", "Curricula you teach", "Curriculum", CURRICULA, strict=True, required=True),
        Field("ped_degree", "has", f"I have a teaching degree in {name}", "Only teachers with a teaching degree", strict=True,
              short=f"Teaching degree in {name}"),
        Field("school_exp", "min", "School experience", "Teacher's school experience (at least)", SCHOOL_EXP, strict=True),
        Field("olympiad_exp", "min", "Olympiad experience (yours or your students')", "Olympiad experience (at least)",
              OLYMPIAD, strict=True, when=("goal", "olympiad"), section="Olympiads"),
    ]  # fmt: skip
    if nmt:
        fields += nmt_fields()
    return Subject(name, "School", tuple(fields), aliases=aliases)


SCHOOL = [
    school("Math", ("Arithmetic and fractions", "Equations and inequalities", "Functions and graphs", "Word problems",
                    "Plane geometry", "Solid geometry", "Trigonometry", "Powers and logarithms", "Derivatives and integrals",
                    "Combinatorics and probability", "Statistics"),
           aliases=("maths", "mathematics", "математика", "алгебра", "геометрія")),
    school("Ukrainian", ("Spelling", "Punctuation", "Morphology", "Syntax", "Vocabulary and idioms", "Phonetics",
                         "Style", "Essay writing", "Everyday Ukrainian for adults"),
           grades=GRADES + scale(("adult", "Adult learner", 13)),
           extra_goals=(("switch", "Switching to Ukrainian (adults)"),),
           aliases=("українська", "українська мова", "ukrainian language")),
    school("History of Ukraine", ("Ancient history", "Kyivan Rus", "Lithuanian-Polish period", "Cossack era", "19th century",
                                  "Ukrainian Revolution 1917–1921", "Interwar period", "World War II", "Soviet period",
                                  "Independent Ukraine", "Maps and sources", "People and dates"),
           aliases=("історія україни", "історія")),
    school("Ukrainian Literature", ("Old Ukrainian literature", "Baroque and classicism", "Romanticism and Shevchenko",
                                    "Realism", "Modernism", "Executed Renaissance", "Sixtiers", "Contemporary literature",
                                    "Text analysis", "Literary theory", "NMT reading list"),
           aliases=("українська література", "література")),
    school("Geography", ("Physical geography", "Economic and social geography", "Geography of Ukraine", "World geography",
                         "Maps and coordinates", "Climate", "Geology", "Problems"), aliases=("географія",)),
    school("Biology", ("Cell", "Genetics problems", "Botany", "Zoology", "Human anatomy", "Ecology", "Evolution", "Biochemistry"),
           aliases=("біологія",)),
    school("Chemistry", ("General chemistry", "Inorganic chemistry", "Organic chemistry", "Calculation problems",
                         "Redox reactions", "Chemistry for medical school entrance"), aliases=("хімія",)),
    school("Physics", ("Mechanics", "Molecular physics and thermodynamics", "Electricity and magnetism", "Optics",
                       "Oscillations and waves", "Atomic and nuclear physics", "Problems", "Lab work"), aliases=("фізика",)),
    school("Computer Science", ("Computer basics", "Algorithms", "Scratch", "Python", "C++", "Databases", "Office apps",
                                "Networks", "Olympiad programming"), nmt=False,
           aliases=("інформатика", "informatics")),
    Subject("Primary School", "School", (
        level(GRADES[:4], teacher="Grades you teach", learner="Grade"),
        goals(("catch_up", "Catch up"), ("homework", "Homework together"), ("adapt", "Adapting after a move"),
              ("tests", "Tests"), ("external", "External studies from abroad")),
        topics("Ukrainian and reading", "Math", "English", "I explore the world", "Handwriting", "Computer science",
               teacher="Subjects", learner="Subjects"),
        Field("curriculum", "in", "Curricula you teach", "Curriculum",
              opts(("nus", "Ukrainian (New Ukrainian School)"), ("ua_remote", "Ukrainian school remotely from abroad"),
                   ("foreign", "School abroad")), strict=True, required=True),
        Field("needs", "in", "Experience with", "Special needs",
              opts(("adhd", "ADHD"), ("dyslexia", "Dyslexia or dysgraphia"), ("asd", "Autism (ASD)"),
                   ("delay", "Developmental delay"), ("bilingual", "Bilingual child")), strict=True),
        Field("ped_degree", "has", "I have a primary school teacher degree", "Only teachers with a primary school degree", strict=True,
              short="Primary school teacher degree"),
    ), aliases=("молодші класи", "початкова школа", "primary"), kids_only=True),  # fmt: skip
    Subject("School Readiness", "School", (
        age(opts(("age_3_4", "3–4 years", {"min_age": 3, "max_age": 4}), ("age_5", "5 years", {"min_age": 5, "max_age": 5}),
                 ("age_6", "6 years", {"min_age": 6, "max_age": 6}), ("age_7", "7 years", {"min_age": 7, "max_age": 7}))),
        level(opts(("no_letters", "Doesn't know letters yet"), ("letters", "Knows letters"),
                   ("syllables", "Reads by syllables"), ("reads", "Reads")),
              teacher="Children you work with", learner="What your child can do", strict=False),
        topics("Reading", "Pre-writing", "Counting", "Logic and attention", "Speech development", "English",
               "Psychological readiness", "School interview"),
        Field("bilingual", "has", "I have experience with bilingual children", "My child is bilingual",
              short="Works with bilingual children"),
        Field("ped_degree", "has", "I have a preschool or primary teacher degree", "Only teachers with a teaching degree", strict=True,
              short="Preschool or primary teacher degree"),
    ), aliases=("підготовка до школи", "дошкільна підготовка"), kids_only=True),  # fmt: skip
]


# ---------- University ----------

UNIVERSITY = [
    Subject("Higher Math", "University", (
        level(opts(("y12", "1st–2nd year"), ("y34", "3rd–4th year"), ("masters", "Master's")),
              teacher="Students' year", learner="Your year", strict=False),
        goals(("understand", "Understand the course"), ("session", "Exam session or module"), ("retake", "Retake"),
              ("masters", "Master's entrance")),
        topics("Calculus", "Linear algebra", "Analytic geometry", "Differential equations", "Probability and statistics",
               "Discrete math", "Series", "Multiple integrals", "Complex analysis", "Numerical methods"),
        Field("major", "in", "Students' majors", "Your major",
              opts("Engineering", "IT", "Economics", "Natural sciences", "Teaching (math)")),
        Field("degree", "has", "Your qualification", "Only teachers with a math degree",
              opts("Math or technical degree", "PhD", "University lecturer"), strict=True),
    ), aliases=("вища математика", "calculus", "матаналіз")),  # fmt: skip
]


# ---------- IT and digital skills ----------

IT_GOALS = (
    ("first_job", "First job in the field"), ("switch", "Career change"), ("promotion", "Growth at my job"),
    ("interview", "Interview or test task"), ("project", "Portfolio project"), ("studies", "University or school"),
    ("business", "For my own business"), ("hobby", "Hobby"),
)  # fmt: skip
GRADE = scale(("teaching", "Teaching only", 0), ("junior", "Junior", 1), ("middle", "Middle", 2), ("senior", "Senior", 3), ("lead", "Lead", 4))


def it(name, topic_items, certs=(), extra=(), pro=True, mentoring="I also review code and help with CV and interviews",
       levels=SKILL, ages=AGES_6, goal_items=IT_GOALS, aliases=(), kids_only=False) -> Subject:  # fmt: skip
    fields = [level(levels), age(ages), goals(*goal_items), topics(*topic_items)]
    if pro:
        fields += [
            Field("grade", "min", "Your level in the profession", "Teacher's level", GRADE,
                  learner_options=scale(("middle", "Middle+", 2), ("senior", "Senior+", 3), ("lead", "Lead", 4)), strict=True),
            years("work_years", "Years of work in the field", "Teacher's work experience"),
        ]  # fmt: skip
    if certs:
        fields.append(Field("certs", "has", "Certificates", "Only teachers with a certificate", opts(*certs), strict=True))
    if mentoring:
        fields.append(Field("mentoring", "has", mentoring, "I need mentoring (reviews, CV, interviews)",
                            short="Mentoring: " + mentoring.split("I also ")[-1]))
    fields += extra
    return Subject(name, "IT and digital skills", tuple(fields), aliases=aliases, kids_only=kids_only)


IT = [
    it("Python", ("Basics", "OOP", "Algorithms", "Web (Django, FastAPI)", "Data (pandas, NumPy)", "Machine learning",
                  "Automation and scripts", "Telegram bots", "Testing (pytest)"), certs=("PCEP", "PCAP"), aliases=("пайтон",)),
    it("Excel & Google Sheets", ("Formulas", "VLOOKUP / XLOOKUP", "Pivot tables", "Charts", "Conditional formatting",
                                 "Power Query", "Power Pivot", "Macros and VBA", "Apps Script", "Dashboards"),
       certs=("Microsoft Office Specialist: Excel",), pro=False, mentoring=None,
       extra=(Field("app", "in", "Apps you teach", "App", opts(("excel", "Excel"), ("sheets", "Google Sheets")),
                    strict=True, required=True),
              Field("domain", "overlap", "Fields you know", "Your field",
                    opts("Accounting and finance", "Sales", "Logistics", "HR", "Analytics", "Education"))),
       aliases=("excel", "ексель", "google sheets", "таблиці")),
    it("AI Tools", ("ChatGPT", "Claude", "Gemini", "Copilot", "Midjourney", "Video generation", "Automation (n8n, Make, Zapier)"),
       pro=False, mentoring=None,
       extra=(Field("domain", "overlap", "Where you apply AI", "What you need AI for",
                    opts("Texts and documents", "Marketing and content", "Studying", "Programming", "Images and video",
                         "Business automation", "Data analysis"), short="Applies AI to"),
              Field("ai_company", "has", "I have rolled out AI tools at a company", "Only teachers who rolled out AI at a company",
                    strict=True, short="Rolled out AI at a company")),
       aliases=("штучний інтелект", "ai", "chatgpt", "нейромережі")),
    it("Coding for Kids", ("ScratchJr", "Scratch", "Minecraft Education", "Roblox Studio (Lua)", "Python for kids",
                           "Game making", "HTML and CSS"),
       pro=False, mentoring=None, kids_only=True,
       ages=opts(("age_6_8", "6–8 years", {"min_age": 6, "max_age": 8}), ("age_9_11", "9–11 years", {"min_age": 9, "max_age": 11}),
                 ("age_12_14", "12–14 years", {"min_age": 12, "max_age": 14}), ("age_15_17", "15–17 years", {"min_age": 15, "max_age": 17})),
       goal_items=(("hobby", "Hobby"), ("logic", "Logic and problem solving"), ("games", "Making own games"),
                   ("olympiad", "Olympiads and contests"), ("future", "Future career in IT")),
       extra=(Field("device", "in", "Devices you teach on", "Device", opts(("computer", "Computer or laptop"), ("tablet", "Tablet (ScratchJr only)")),
                    strict=True, required=True),
              years("kids_years", "Years of teaching children", "Teacher's experience with children")),
       aliases=("програмування для дітей", "scratch", "скретч")),
    it("JavaScript", ("HTML and CSS", "JavaScript", "TypeScript", "React", "Vue", "Angular", "Next.js", "Node.js", "Testing"),
       extra=(Field("track", "in", "Tracks you teach", "Track", opts("Frontend", "Backend (Node.js)", "Fullstack")),),
       aliases=("js", "frontend", "фронтенд", "джаваскрипт")),
    it("Data Analytics", ("SQL", "Excel", "Power BI", "Tableau", "Looker Studio", "Python (pandas)", "Statistics",
                          "Google Analytics 4", "A/B tests"), certs=("Google Data Analytics", "Microsoft PL-300 (Power BI)"),
       aliases=("аналітика даних", "data analyst", "sql", "power bi")),
    it("Cybersecurity", ("Digital hygiene", "Business protection", "Pentest and ethical hacking", "SOC / Blue Team",
                         "Network security", "Web application security", "OSINT"),
       certs=("CompTIA Security+", "CEH", "OSCP", "CISSP"), aliases=("кібербезпека", "security")),
    it("QA / Software Testing", ("Manual testing", "API testing (Postman)", "Automation (Selenium, Playwright, Cypress)",
                                 "Mobile testing", "Performance testing (JMeter)", "SQL for testers"),
       certs=("ISTQB Foundation",),
       extra=(Field("auto_lang", "in", "Automation languages", "Automation language", opts("Java", "Python", "JavaScript", "C#")),),
       aliases=("qa", "тестування", "тестувальник")),
    it("Computer Basics", ("Basic actions", "Internet and search", "Email", "Messengers and video calls", "Diia and public services",
                           "Online banking", "Protection from scams", "Documents (Word)", "Photos"),
       levels=SKILL[:3], pro=False, mentoring=None, ages=AGES_13,
       goal_items=(("everyday", "Everyday life"), ("work", "Work"), ("safety", "Safety online"), ("family", "Keeping in touch with family")),
       extra=(Field("device", "in", "Devices you teach on", "Device",
                    opts(("windows", "Windows computer"), ("mac", "Mac"), ("android", "Android phone"), ("ios", "iPhone or iPad")),
                    strict=True, required=True),
              Field("seniors", "has", "I have experience teaching people 60+", "The learner is 60+", short="Teaches people 60+")),
       aliases=("комп'ютерна грамотність", "компютерна грамотність", "computer literacy")),
    it("Graphic Design", ("Photoshop", "Illustrator", "Figma", "Canva", "CorelDRAW", "Affinity", "InDesign", "Logo and brand identity",
                          "Social media design", "Print design", "Packaging", "Illustration", "Presentations", "Ads and banners"),
       certs=("Adobe Certified Professional",), mentoring="I also review portfolios and help with job search",
       aliases=("графічний дизайн", "photoshop", "фотошоп")),
    it("UI/UX Design", ("Figma", "UX research", "Wireframes and prototypes", "UI design", "Design systems", "Mobile apps",
                        "Websites", "Usability testing"),
       certs=("Google UX Design",), mentoring="I also review portfolios and help with job search",
       aliases=("ui ux", "ux", "дизайн інтерфейсів", "figma")),
    it("Video Editing", ("Premiere Pro", "DaVinci Resolve", "Final Cut Pro", "CapCut", "After Effects", "Reels, TikTok, Shorts",
                         "YouTube", "Weddings and events", "Ads", "Motion design", "Color grading", "Sound"),
       mentoring="I also review portfolios and help with job search",
       extra=(Field("device", "in", "Devices you teach on", "Device", opts(("computer", "Computer"), ("phone", "Smartphone (CapCut)")),
                    strict=True, required=True),),
       aliases=("відеомонтаж", "монтаж", "premiere")),
]


# ---------- Music ----------

MUSIC_EDU = scale(("none", "No formal music education", 0), ("school", "Music school", 1), ("college", "Music college", 2),
                  ("academy", "Music academy or conservatory", 3))  # fmt: skip
MUSIC_GOALS = (
    ("self", "For myself"), ("entrance", "Music school or college entrance"), ("competitions", "Competitions and auditions"),
    ("band", "Playing in a band"), ("child", "Child development"), ("songs", "Recording my songs"),
)  # fmt: skip


def music(name, kind_label, kinds, styles, topic_items, extra=(), home=opts("Yes", "No"), aliases=()) -> Subject:
    return Subject(name, "Music", (
        level(SKILL),
        age(),
        goals(*MUSIC_GOALS),
        topics(*topic_items),
        Field("kind", "in", "What you teach", kind_label, opts(*kinds), strict=True, required=True, short=kind_label),
        Field("styles", "overlap", "Styles", "Styles", opts(*styles)),
        Field("music_edu", "min", "Music education", "Teacher's music education (at least)", MUSIC_EDU,
              learner_options=MUSIC_EDU[1:], strict=True),
        Field("stage", "has", "Stage experience", "I want a teacher who performs",
              opts("Concerts", "Band", "Studio recordings", "Session musician", "Music school teacher")),
        *extra,
        Field("home", "info", None, "Instrument at home", home),
    ), aliases=aliases)  # fmt: skip


MUSIC_TOPICS = ("Reading music", "Chords and tabs", "Technique", "Improvisation", "Playing by ear", "Music theory", "Songwriting", "Recording")

MUSIC = [
    music("Guitar", "Guitar", ("Acoustic", "Classical", "Electric", "Bass"),
          ("Pop and accompaniment", "Rock", "Fingerstyle", "Classical", "Blues", "Jazz", "Metal", "Flamenco"),
          MUSIC_TOPICS, aliases=("гітара", "гра на гітарі")),
    music("Piano", "Instrument", ("Acoustic piano", "Digital piano", "Synthesizer"),
          ("Classical", "Pop and accompaniment", "Jazz", "Improvisation", "Film music"),
          MUSIC_TOPICS[:6] + ("Music school programme",), aliases=("фортепіано", "піаніно", "клавішні")),
    music("Singing", "Style of singing", ("Pop", "Academic (classical)", "Jazz", "Folk", "Rock and extreme vocals", "Musical theatre", "Choir"),
          ("Pop", "Rock", "Jazz", "Folk", "Classical", "Musicals"),
          ("Breathing", "Range", "Pitch", "Stage presence", "Music theory", "Songwriting", "Recording"),
          extra=(Field("voice", "overlap", "Voice work", "Voice needs",
                       opts("Children's voice", "Voice change in teens", "Voice recovery")),),
          home=opts("Microphone at home", "No equipment"), aliases=("вокал", "спів")),
    music("Drums", "Kit", ("Acoustic kit", "Electronic kit", "Percussion (cajón, djembe)"),
          ("Rock", "Pop", "Jazz", "Metal", "Funk", "Latin"),
          ("Reading music", "Technique", "Grooves", "Fills", "Improvisation", "Playing with a band"),
          home=opts("Acoustic kit", "Electronic kit", "Practice pad", "Nothing yet"), aliases=("барабани", "ударні")),
]


# ---------- Art and hobbies ----------

HOBBY = [
    Subject("Drawing", "Art and hobbies", (
        level(SKILL),
        age(),
        goals(("hobby", "Hobby"), ("entrance", "Art school or academy entrance"), ("portfolio", "Portfolio"),
              ("child", "Child development")),
        topics("Academic drawing", "Painting", "Sketching", "Illustration", "Portrait", "Anime and manga", "Landscape",
               "Creative drawing for kids", teacher="Directions", learner="Directions"),
        Field("techniques", "overlap", "Techniques", "Techniques",
              opts("Pencil and graphics", "Charcoal", "Watercolour", "Gouache", "Acrylic", "Oil", "Pastel", "Markers and liners")),
        Field("art_edu", "min", "Art education", "Teacher's art education (at least)",
              scale(("none", "No formal art education", 0), ("school", "Art school", 1), ("college", "Art college", 2), ("academy", "Art academy", 3)),
              learner_options=scale(("school", "Art school", 1), ("college", "Art college", 2), ("academy", "Art academy", 3)), strict=True),
        Field("entrance", "in", "Entrance you prepare for", "Entrance to",
              opts("Art school", "Art college", "Art academy", "Architecture", "Design"),
              strict=True, required=True, when=("goal", "entrance"), section="Entrance preparation"),
    ), aliases=("малювання", "живопис", "рисунок")),  # fmt: skip
    Subject("Chess", "Art and hobbies", (
        level(scale(("rules", "Learning the rules", 0), ("knows", "Knows the rules", 1), ("u1200", "Rating under 1200", 2),
                    ("r1200", "Rating 1200–1599", 3), ("r1600", "Rating 1600–1999", 4), ("r2000", "Rating 2000+", 5))),
        age(),
        goals(("hobby", "Hobby"), ("child", "Child development"), ("tournaments", "Tournaments and rank"),
              ("online", "Online rating")),
        topics("Rules and basic mates", "Openings", "Tactics", "Strategy (middlegame)", "Endgame", "Game analysis",
               "Tournament preparation", "Blitz"),
        Field("rating", "min", "Your rating (FIDE or online)", "Teacher's rating",
              scale(("r1400", "1400–1599", 1400), ("r1600", "1600–1799", 1600), ("r1800", "1800–1999", 1800),
                    ("r2000", "2000–2199", 2000), ("r2200", "2200–2399", 2200), ("r2400", "2400+", 2400)),
              learner_options=scale(("r1600", "1600+", 1600), ("r1800", "1800+", 1800), ("r2000", "2000+", 2000),
                                    ("r2200", "2200+", 2200), ("r2400", "2400+", 2400)),
              strict=True, hint="Add a link to your FIDE, lichess or chess.com profile in step 3."),
        Field("title", "min", "Title", "Teacher's title",
              scale(("none", "No title", 0), ("category", "1st–3rd category", 1), ("cm", "Candidate Master (CM)", 2),
                    ("master", "Master (FM / WFM / national master)", 3), ("im", "International Master (IM / WIM)", 4),
                    ("gm", "Grandmaster (GM / WGM)", 5)),
              learner_options=scale(("cm", "Candidate Master+", 2), ("master", "Master+", 3), ("im", "International Master+", 4),
                                    ("gm", "Grandmaster", 5)), strict=True),
        Field("coach", "has", "Coaching qualification", "Only teachers with a coaching qualification",
              opts("National coaching category", "FIDE Instructor", "FIDE Trainer", "FIDE Senior Trainer"), strict=True),
    ), aliases=("шахи",)),  # fmt: skip
    Subject("Photography", "Art and hobbies", (
        level(SKILL),
        age(AGES_6),
        goals(("hobby", "Hobby"), ("earn", "Start earning"), ("business", "For my business or social media")),
        topics("Portrait", "Weddings and events", "Product photography", "Landscape", "Reportage and street", "Food",
               "Interiors", "Mobile photography", teacher="Genres", learner="Genres"),
        Field("camera", "in", "Cameras you teach", "Your camera",
              opts(("phone", "Smartphone"), ("camera", "Mirrorless or DSLR"), ("film", "Film")), strict=True, required=True),
        Field("editing", "overlap", "Editing", "Editing", opts("Lightroom", "Photoshop", "Capture One", "Mobile apps")),
        years("photo_years", "Years of paid photography", "Teacher's experience"),
    ), aliases=("фотографія", "фото")),  # fmt: skip
    Subject("Dance", "Art and hobbies", (
        level(SKILL),
        age(),
        goals(("hobby", "Hobby and fitness"), ("competitions", "Competitions"), ("wedding", "Wedding dance"),
              ("entrance", "Entrance"), ("child", "Child development"), ("event", "Performance at an event")),
        Field("style", "in", "Styles you teach", "Style",
              opts("Contemporary", "Hip-hop", "Breaking", "Ballroom (standard)", "Ballroom (latin)", "Ballet", "Folk",
                   "Jazz-funk", "Heels", "Salsa and bachata", "K-pop cover", "Wedding dance", "Dance for kids"),
              strict=True, required=True, tags=True),
        Field("dance_edu", "min", "Dance education", "Teacher's dance education (at least)",
              scale(("none", "No formal dance education", 0), ("studio", "Dance studio", 1), ("college", "Choreography college", 2),
                    ("academy", "Academy or university", 3)),
              learner_options=scale(("studio", "Dance studio", 1), ("college", "College", 2), ("academy", "Academy", 3)), strict=True),
        Field("competitions", "has", "Competition experience", "Only teachers with competition experience",
              opts("Performances", "Competitions", "Judge", "Team coach"), strict=True),
        Field("partner", "info", None, "Partner", opts("I have a partner", "I need a partner", "Solo")),
    ), aliases=("танці", "хореографія")),  # fmt: skip
]


# ---------- Child development ----------

KIDS = [
    Subject("Speech Therapy", "Child development", (
        age(opts(("age_3_5", "3–5 years", {"min_age": 3, "max_age": 5}), ("age_6_7", "6–7 years", {"min_age": 6, "max_age": 7}),
                 ("age_8_10", "8–10 years", {"min_age": 8, "max_age": 10}), ("age_11_17", "11–17 years", {"min_age": 11, "max_age": 17}),
                 ("adults", "Adults", {"min_age": 18, "max_age": 120}))),
        Field("area", "in", "What you work with", "What you need",
              opts("Sound production", ("delay", "Speech delay"), ("underdevelopment", "General speech underdevelopment"),
                   "Stuttering", "Dysarthria", "Alalia", "Dyslexia and dysgraphia", ("asd", "Autism (ASD)"),
                   "Bilingual children", ("recovery", "Speech recovery after a stroke or injury")),
              strict=True, required=True, tags=True, short="Works with"),
        Field("assessment", "has", "I do an initial assessment", "I need an assessment first", strict=True,
              short="Initial assessment"),
        Field("diploma", "has", "I have a speech therapist or special education diploma", None, required=True,
              short="Speech therapist diploma", hint="Required. Upload the diploma in step 3 — a moderator checks it."),
        Field("massage", "has", "I do speech therapy massage (in person)", "I need speech therapy massage", strict=True,
              short="Speech therapy massage"),
    ), aliases=("логопед", "логопедія", "speech")),  # fmt: skip
    Subject("Mental Arithmetic", "Child development", (
        age(opts(("age_4_6", "4–6 years", {"min_age": 4, "max_age": 6}), ("age_7_9", "7–9 years", {"min_age": 7, "max_age": 9}),
                 ("age_10_12", "10–12 years", {"min_age": 10, "max_age": 12}), ("age_13", "13+ years", {"min_age": 13, "max_age": 17}))),
        level(opts(("new", "New to it"), ("abacus", "Knows the abacus"), ("continuing", "Continuing a programme"))),
        goals(("attention", "Attention and memory"), ("counting", "Fast counting"), ("school", "Support for school math"),
              ("competitions", "Competitions")),
        topics("Abacus (soroban)", "Flash anzan", "Mental map", teacher="Methods", learner="Method"),
        Field("method_cert", "has", "I have a certificate in the method", "Only certified teachers", strict=True,
              short="Certified in the method"),
    ), aliases=("ментальна арифметика",), kids_only=True),  # fmt: skip
    Subject("Robotics & STEM", "Child development", (
        age(opts(("age_5_7", "5–7 years", {"min_age": 5, "max_age": 7}), ("age_8_10", "8–10 years", {"min_age": 8, "max_age": 10}),
                 ("age_11_13", "11–13 years", {"min_age": 11, "max_age": 13}), ("age_14_17", "14–17 years", {"min_age": 14, "max_age": 17}))),
        level(SKILL),
        goals(("hobby", "Hobby"), ("competitions", "Competitions"), ("project", "School or MAN project"),
              ("future", "Future engineering career")),
        topics("LEGO Education (WeDo, SPIKE, Mindstorms)", "Arduino", "micro:bit", "Raspberry Pi", "3D modelling and printing",
               "Electronics", teacher="Platforms", learner="Platforms"),
        Field("kit", "has", "I provide a kit at lessons", "No kit at home (the teacher brings one)", strict=True,
              short="Provides a kit"),
        Field("contests", "in", "Competitions you prepare for", "Competition",
              opts("FIRST LEGO League", "World Robot Olympiad", "MAN", "Hackathons"),
              strict=True, required=True, when=("goal", "competitions"), section="Competitions"),
        Field("degree", "has", "I have a technical, engineering or teaching degree", "Only teachers with a degree", strict=True,
              short="Technical or teaching degree"),
    ), aliases=("робототехніка", "stem", "lego", "arduino"), kids_only=True),  # fmt: skip
]


# ---------- Career and business ----------

CAREER = [
    Subject("Digital Marketing", "Career and business", (
        level(SKILL),
        age(AGES_13),
        goals(("own_business", "Promote my business"), ("specialist", "Become a specialist (job or freelance)"),
              ("promotion", "Growth at my job")),
        topics("SMM", "Meta Ads", "Google Ads", "SEO", "Email marketing", "Content marketing", "Web analytics (GA4)",
               "TikTok", "Marketing strategy", "Marketplaces (Prom, Rozetka)"),
        Field("platforms", "overlap", "Platforms", "Platforms",
              opts("Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Telegram", "Google")),
        years("mk_years", "Years in marketing", "Teacher's experience"),
        Field("niches", "overlap", "Niches you worked with", "Your niche",
              opts("E-commerce", "Services", "B2B", "Education", "IT", "Local business")),
        Field("certs", "has", "Certificates", "Only teachers with a certificate",
              opts("Google Ads", "Meta Certified", "HubSpot", "Google Analytics"), strict=True),
    ), aliases=("інтернет-маркетинг", "маркетинг", "smm", "таргет")),  # fmt: skip
    Subject("Accounting", "Career and business", (
        level(SKILL),
        age(AGES_13),
        goals(("own_fop", "Keep books for my FOP"), ("become", "Become an accountant"), ("growth", "Professional growth"),
              ("acca", "ACCA or DipIFR exams"), ("students", "Help with studies")),
        topics(("fop", "FOP bookkeeping and taxes"), ("llc", "Company (TOV) bookkeeping"), "Payroll and HR records", "VAT",
               "Reporting", ("ifrs", "IFRS"), "Management accounting", "Financial analysis", "Audit"),
        Field("software", "overlap", "Software", "Software", opts("BAS", "M.E.Doc", "Vchasno", "Debet Plus", "Excel", "SAP")),
        Field("position", "min", "Your position", "Teacher's position",
              scale(("accountant", "Accountant", 1), ("chief", "Chief accountant", 2), ("auditor", "Auditor", 3), ("cfo", "Finance director", 4)),
              learner_options=scale(("chief", "Chief accountant+", 2), ("auditor", "Auditor+", 3), ("cfo", "Finance director", 4)), strict=True),
        Field("acc_certs", "has", "Qualifications", "Only teachers with a qualification",
              opts("Accounting or economics degree", "ACCA", "DipIFR", "CAP / CIPA", "Auditor certificate"), strict=True),
    ), aliases=("бухгалтерія", "бухгалтерський облік", "облік")),  # fmt: skip
    Subject("Public Speaking", "Career and business", (
        level(opts(("afraid", "Afraid of speaking"), ("nervous", "Speaks with nerves"), ("regular", "Speaks regularly"))),
        age(AGES_6),
        goals(("event", "A specific talk"), ("interview", "Job interview"), ("career", "Career"), ("blog", "Blog or video"),
              ("school", "School or university talks and debates")),
        topics("Fear of speaking", "Structure and storytelling", "Diction", "Voice", "Presentations", "Job interviews",
               "Negotiations", "Hosting events", "On camera", "Debates", "Speaking in English"),
        Field("speech_lang", "in", "Languages of the talks you coach", "Language of your talk",
              opts("Ukrainian", "English"), strict=True, required=True),
        Field("background", "has", "Your background", "Only professional speakers or hosts",
              opts("Actor", "TV or radio host", "Conference speaker", "Business trainer", "Journalist"), strict=True),
    ), aliases=("ораторське мистецтво", "публічні виступи", "риторика")),  # fmt: skip
]


SUBJECTS: list[Subject] = [*LANGUAGES, *SCHOOL, *UNIVERSITY, *IT, *MUSIC, *HOBBY, *KIDS, *CAREER]
CATEGORIES = ["Languages", "School", "University", "IT and digital skills", "Music", "Art and hobbies",
              "Child development", "Career and business"]  # fmt: skip
BY_NAME: dict[str, Subject] = {s.name.casefold(): s for s in SUBJECTS}
_ALIASES: dict[str, Subject] = {a.casefold(): s for s in SUBJECTS for a in (s.name, *s.aliases)}
NAMES = [s.name for s in SUBJECTS]

# Values of the old flat "goals" list (before per-subject fields) -> goal keys.
LEGACY_GOALS = {
    "Job interviews": "interviews", "Work": "work", "Travel": "travel", "Exam preparation": "exam",
    "Everyday conversation": "conversation", "School support": "school", "Relocation": "relocation", "Hobby": "hobby",
}  # fmt: skip


def get(name: str | None) -> Subject | None:
    """A subject by its name or an alias ("Maths", "англійська"), or None."""
    return _ALIASES.get((name or "").strip().casefold())


def meta() -> dict:
    return {"categories": CATEGORIES, "subjects": [s.to_dict() for s in SUBJECTS]}


# ---------- Cleaning answers ----------

def _keys(options) -> list[str]:
    return [o["key"] for o in options]


def _option(options, key) -> dict | None:
    return next((o for o in options if o["key"] == key), None)


def _as_list(value) -> list:
    if value is None or value is False or value == "":
        return []
    return list(value) if isinstance(value, (list, tuple)) else [value]


def _shown(f: Field, answers: dict, side: str) -> bool:
    """A field with `when` is shown only if the controlling answer has the value."""
    if f.when is None:
        return True
    value = answers.get(f.when[0])
    return f.when[1] in value if side == "teacher" and isinstance(value, list) else value == f.when[1]


def clean_teacher(subject: Subject, attrs: dict) -> dict:
    """The teacher's answers for one subject, with unknown fields and values dropped."""
    out: dict = {}
    for f in subject.fields:
        if f.teacher is None or f.key not in attrs:
            continue
        value = attrs[f.key]
        if f.match == "min":
            if isinstance(value, str) and value in _keys(f.options):
                out[f.key] = value
        elif f.match == "has" and not f.options:
            if value is True:
                out[f.key] = True
        else:
            chosen = set(_as_list(value))
            values = [k for k in _keys(f.options) if k in chosen]
            if values:
                out[f.key] = values
    return {k: v for k, v in out.items() if _shown(subject.by[k], out, "teacher")}


def clean_learner(subject: Subject, attrs: dict, request: bool = False) -> dict:
    """The learner's answers for one subject (search filters or a request)."""
    out: dict = {}
    for f in subject.fields:
        if f.learner is None or f.key not in attrs or (request and not f.in_request):
            continue
        if not request and f.match == "info":
            continue
        values = _as_list(attrs[f.key])
        if f.match == "has":
            if values and values[0] in (True, "1", "true", "yes"):
                out[f.key] = True
        elif f.match == "overlap":
            chosen = set(values)
            picked = [k for k in _keys(f.options) if k in chosen]
            if picked:
                out[f.key] = picked
        elif values and values[0] in _keys(f.learner_choices()):
            out[f.key] = values[0]
    return {k: v for k, v in out.items() if _shown(subject.by[k], out, "learner")}


def age_key(subject: Subject, years: int | None) -> str | None:
    """The subject's age option for an age in years (18 for "myself")."""
    f = subject.by.get("age")
    if f is None or years is None:
        return None
    return next((o["key"] for o in f.options if o["min_age"] <= years <= o["max_age"]), None)


def _rank(options, key) -> float | None:
    o = _option(options, key)
    return None if o is None else o.get("n", _keys(options).index(key))


def teacher_missing(subject: Subject, attrs: dict) -> list[str]:
    """Required answers the teacher hasn't given yet, as readable names."""
    missing = [
        f.teacher for f in subject.fields
        if f.teacher and f.required and _shown(f, attrs, "teacher") and not attrs.get(f.key)
    ]  # fmt: skip
    for f in subject.fields:
        if f.cap and attrs.get(f.key) and attrs.get(f.cap):
            cap = subject.by[f.cap]
            top = _rank(cap.options, attrs[f.cap])
            if any((_rank(f.options, v) or 0) > top for v in attrs[f.key]):
                missing.append(f"{f.teacher} (not above your own level)")
    return missing


# ---------- Matching ----------

def _passes(f: Field, teacher_attrs: dict, learner_value, subject: Subject) -> float:
    """1 if the teacher fits the learner's answer, 0 if not, a share for "overlap"."""
    theirs = teacher_attrs.get(f.against or f.key)
    if f.match == "in":
        return float(learner_value in (theirs or []))
    if f.match == "min":
        source = subject.by[f.against] if f.against else f
        mine, need = _rank(source.options, theirs), _rank(f.learner_choices(), learner_value)
        return float(mine is not None and need is not None and mine >= need)
    if f.match == "has":
        return float(bool(theirs))
    if f.match == "overlap":
        wanted = set(learner_value)
        return len(wanted & set(theirs or [])) / len(wanted) if wanted else 1.0
    return 1.0


def compare(subject: Subject, teacher_attrs: dict, learner_attrs: dict) -> tuple[list[str], float, int]:
    """(strict fields the teacher fails, soft points, soft total) for the learner's cleaned answers."""
    failed, points, total = [], 0.0, 0
    for key, value in learner_attrs.items():
        f = subject.by[key]
        if f.match == "info":
            continue
        score = _passes(f, teacher_attrs, value, subject)
        if f.strict:
            if score < 1:
                failed.append(key)
        else:
            total += 1
            points += score
    return failed, points, total


# ---------- Readable text ----------

def _labels(options, values) -> list[str]:
    return [o["label"] for v in _as_list(values) if (o := _option(options, v))]


def public_label(f: Field) -> str:
    """The teacher's label as learners read it: "Your English level" -> "English level"."""
    if f.short:
        return f.short
    text = re.sub(r" you (teach on|teach|prepare for|know|coach|worked with)$", "", f.teacher)
    text = re.sub(r"^Your own ", "Own ", text)
    text = re.sub(r"^Your ", "", text).replace(" your ", " ")
    return text[:1].upper() + text[1:]


def describe_teacher(subject: Subject, attrs: dict) -> list[dict]:
    """[{label, value}] for the teacher's profile page and moderation."""
    facts, extras = [], []
    for f in subject.fields:
        value = attrs.get(f.key)
        if f.teacher is None or not value:
            continue
        if value is True:
            extras.append(public_label(f))
        elif text := ", ".join(_labels(f.options, value)):
            facts.append({"label": public_label(f), "value": text})
    if extras:
        facts.append({"label": "Also", "value": " · ".join(extras)})
    return facts


def describe_learner(subject: Subject, attrs: dict) -> list[dict]:
    """[{label, value}] for a request: what the learner told the teacher."""
    facts = []
    for f in subject.fields:
        value = attrs.get(f.key)
        if f.learner is None or not value:
            continue
        text = "Yes" if value is True else ", ".join(_labels(f.learner_choices(), value))
        if text:
            facts.append({"label": f.learner, "value": text})
    return facts


def labels(subject: Subject | None, key: str, value) -> list[str]:
    """Readable text of one answer (["b1"] -> ["Intermediate (B1)"])."""
    f = subject.by.get(key) if subject else None
    if f is None or not value:
        return []
    return _labels(f.learner_choices() if f.match == "min" else f.options, value)


def label(subject: Subject | None, key: str, value) -> str:
    return ", ".join(labels(subject, key, value))


def card_tags(offers: list[dict]) -> list[str]:
    """Topic labels of all the teacher's subjects, for the tags on the teacher card."""
    tags = []
    for offer in offers:
        subject = get(offer.get("subject"))
        for f in subject.fields if subject else ():
            if f.tags:
                tags += _labels(f.options, offer.get("attrs", {}).get(f.key))
    return tags
