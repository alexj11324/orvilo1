@regression @tasks @my-issues
Feature: My issues rows keep every control on top
  Scenario: The hover selection checkbox never covers the priority mark
    Given I am logged in with a session
    Then no control in a hovered My issues row is drawn under another element
