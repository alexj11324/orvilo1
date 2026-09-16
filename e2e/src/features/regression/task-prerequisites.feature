@task-prerequisites
Feature: Issue prerequisite tasks
  Scenario: Configure prerequisites and wait for every successful completion
    Given I am logged in with a session
    And I have an issue with two available prerequisite tasks
    When I add both prerequisites through the issue picker
    Then the issue should show 0 of 2 prerequisites complete and remain blocked
    And the API should reject advancing the blocked issue
    When I mark prerequisite 1 as "completed"
    Then the issue should show 1 of 2 prerequisites complete and remain blocked
    When I mark prerequisite 2 as "canceled"
    Then the issue should show 1 of 2 prerequisites complete and remain blocked
    When I mark prerequisite 2 as "completed"
    Then the issue should be ready after both prerequisites complete
    When I remove the first prerequisite through the issue panel
    Then only the second prerequisite should remain
