import json

FILE = "data/users.json"


def load_users():
    with open(FILE, "r") as f:
        return json.load(f)


def save_users(data):
    with open(FILE, "w") as f:
        json.dump(data, f, indent=2)


def add_session(username, score, notes):

    data = load_users()

    if username not in data:
        data[username] = {
            "sessions": []
        }

    data[username]["sessions"].append({
        "score": score,
        "notes": notes
    })

    save_users(data)