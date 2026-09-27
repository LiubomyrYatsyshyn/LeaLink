"""Fixed option lists used by the forms (the same values the frontend shows)."""
from typing import Literal, get_args

Level = Literal["A1", "A2", "B1", "B2", "C1", "C2"]
LanguageLevel = Literal["A1", "A2", "B1", "B2", "C1", "C2", "Native"]
AgeGroup = Literal["kids", "teens", "adults"]  # 6–12, 13–17, 18+
Goal = Literal[
    "Job interviews",
    "Work",
    "Travel",
    "Exam preparation",
    "Everyday conversation",
    "School support",
    "Relocation",
    "Hobby",
]
Format = Literal["online", "offline", "both"]
LessonType = Literal["individual", "group"]
Duration = Literal[30, 45, 60, 90]
TrialMinutes = Literal[15, 30]
ResponseHours = Literal[24, 48]
Currency = Literal["USD", "EUR", "UAH"]
ContactMethod = Literal["telegram", "whatsapp", "email", "phone"]
ForWhom = Literal["myself", "child"]
DayPart = Literal["morning", "afternoon", "evening"]  # 08–12, 12–17, 17–21
TimePref = Literal["morning", "afternoon", "evening", "weekdays", "weekends"]
DeclineReason = Literal[
    "My schedule is full",
    "The level isn't a good fit",
    "The goal is outside my expertise",
    "Not accepting new students right now",
    "Other",
]

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAYS = DAYS[:5]
WEEKEND = DAYS[5:]
DAY_PARTS = list(get_args(DayPart))
# Weekly availability cells look like "mon_morning", "sat_evening".
AVAILABILITY_SLOTS = [f"{day}_{part}" for day in DAYS for part in DAY_PARTS]

# Approximate rates to USD. Used only to compare a teacher's price with a learner's budget.
CURRENCY_TO_USD = {"USD": 1.0, "EUR": 1.08, "UAH": 0.024}

# Suggestions for the subject pickers; teachers may also type their own subject.
SUBJECTS = ["English", "Business English", "IELTS", "Math", "Python", "Guitar", "Spanish", "Ukrainian"]
PLATFORMS = ["Zoom", "Google Meet", "Skype", "Microsoft Teams", "Other"]


def options() -> dict:
    return {
        "levels": list(get_args(Level)),
        "language_levels": list(get_args(LanguageLevel)),
        "age_groups": list(get_args(AgeGroup)),
        "goals": list(get_args(Goal)),
        "formats": list(get_args(Format)),
        "lesson_types": list(get_args(LessonType)),
        "durations": list(get_args(Duration)),
        "trial_minutes": list(get_args(TrialMinutes)),
        "response_hours": list(get_args(ResponseHours)),
        "currencies": list(get_args(Currency)),
        "contact_methods": list(get_args(ContactMethod)),
        "time_prefs": list(get_args(TimePref)),
        "availability_slots": AVAILABILITY_SLOTS,
        "decline_reasons": list(get_args(DeclineReason)),
        "platforms": PLATFORMS,
    }
