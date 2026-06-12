def analyze_answers(answers):
    total = max(len(answers), 1)
    correct = sum(1 for answer in answers if answer.get("correct"))
    reaction_times = [
        int(answer.get("reaction_time_ms", 0))
        for answer in answers
        if int(answer.get("reaction_time_ms", 0)) > 0
    ]
    average_ms = (
        sum(reaction_times) // len(reaction_times)
        if reaction_times
        else 1200
    )
    accuracy = round(correct / total * 100)
    speed = max(0, min(100, round(120 - average_ms / 12)))
    pressure = max(0, min(100, round((accuracy + speed) / 2)))
    weakness = (
        "reaction_speed" if speed < accuracy else "antisocial_thinking"
    )
    return {
        "radar": {
            "reaction_speed": speed,
            "color_discrimination": accuracy,
            "antisocial_thinking": accuracy,
            "pressure_resistance": pressure,
        },
        "weakness": weakness,
        "recommended_difficulty": 3 if accuracy >= 80 else 2,
        "comment": "反应稳定，继续挑战更高难度！"
        if accuracy >= 80
        else "保持节奏，先把相反规则判断准确。",
    }
