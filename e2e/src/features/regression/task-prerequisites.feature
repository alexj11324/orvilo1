@regression @tasks @prerequisites
Feature: Issue prerequisite execution gates
  Scenario: All prerequisites must complete and an upstream reopen blocks the issue again
    Given I am logged in with a session
    Then issue prerequisites enforce all-completed readiness and recover after upstream changes
