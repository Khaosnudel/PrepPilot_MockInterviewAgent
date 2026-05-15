"""Predefined role list for Open Practice Mode.

Contains the catalog of professional roles available for selection
when a user chooses Open Practice Mode for their interview session.
"""

# At least 10 professional roles as required by Requirement 2.1
AVAILABLE_ROLES: list[str] = [
    "Software Engineer",
    "Data Scientist",
    "Product Manager",
    "DevOps Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "Machine Learning Engineer",
    "QA Engineer",
    "Cloud Architect",
]


def get_roles() -> list[str]:
    """Return the list of available professional roles.

    Returns:
        A list of role name strings available for Open Practice Mode.
    """
    return list(AVAILABLE_ROLES)


# Alias for backward compatibility
get_available_roles = get_roles
